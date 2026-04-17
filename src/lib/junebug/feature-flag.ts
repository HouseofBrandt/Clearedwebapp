/**
 * Junebug Threads feature flag (A4.7) + per-user beta gate.
 *
 * Two env vars control rollout:
 *
 *   NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true" | "false" (default false)
 *     Global kill switch. When false, Junebug is invisible to everyone.
 *     NEXT_PUBLIC_ so client + server stay in sync (no hydration mismatch).
 *
 *   JUNEBUG_BETA_EMAIL_DOMAINS = "firmdomain.com,anotherdomain.com" (optional)
 *     When SET, Junebug is only visible to users whose email ends with one
 *     of the listed domains. When UNSET (or empty), Junebug is visible to
 *     everyone once the global flag is on. Server-only; not NEXT_PUBLIC_
 *     because client rendering would leak the beta domain list.
 *
 * Rollout sequence per docs/spec-junebug-threads.md §8:
 *   1. Merge with flag=false — schema deploys, nothing renders.
 *   2. Flag=true + BETA_EMAIL_DOMAINS=firm.com → internal-only dogfood.
 *   3. BETA_EMAIL_DOMAINS unset + flag=true → everyone.
 *   4. (2 weeks later) flag=true permanently, delete legacy chat panel
 *      and this file's gating entirely.
 */

export function junebugThreadsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED === "true"
}

/**
 * Parse the comma-separated beta domain list. Exported for tests and for
 * places that want to display "Junebug is beta-gated to these domains" in
 * an admin UI. Case-insensitive; whitespace-tolerant.
 */
export function getBetaEmailDomains(): string[] {
  const raw = process.env.JUNEBUG_BETA_EMAIL_DOMAINS || ""
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Returns true iff Junebug should be visible to the given user.
 *
 * Logic:
 *   - Global flag off → false for everyone (kill switch wins).
 *   - Global flag on + beta domain list empty → true for everyone.
 *   - Global flag on + beta domain list set → only users whose email
 *     domain matches one of the listed domains.
 *   - Null/missing email + beta list set → false (can't verify,
 *     can't gate them in). This is the safe default — better to hide
 *     a feature the user can't open than to leak it to anonymous flows.
 *
 * Email comparison is case-insensitive. Trims "user+tag@" local-part
 * (doesn't matter — we only care about the domain portion).
 *
 * Pure function. Deterministic. Safe to call from server or client IF the
 * caller has an email in hand. Client-side callers are expected to get
 * the email from `useSession` or a prop — never invent it.
 */
export function junebugVisibleForUser(email?: string | null): boolean {
  if (!junebugThreadsEnabled()) return false

  const betaDomains = getBetaEmailDomains()
  if (betaDomains.length === 0) return true // no gate — flag-on means everyone

  if (!email) return false

  // Use lastIndexOf so that pathological "a@b@firm.com" inputs resolve
  // against the rightmost @-delimited domain. Reject emails missing
  // either a local part ("@firm.com") or a domain part ("alice@").
  const atIndex = email.lastIndexOf("@")
  if (atIndex <= 0 || atIndex >= email.length - 1) return false
  const domain = email.slice(atIndex + 1).toLowerCase()
  return betaDomains.includes(domain)
}
