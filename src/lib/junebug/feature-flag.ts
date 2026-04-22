/**
 * Junebug Threads feature flag (A4.7).
 *
 * Two-tier gate during the staged rollout (spec §8):
 *
 *   1. `junebugThreadsEnabled()` — global kill switch. Reads
 *      `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED`. Flip this to `"true"` for
 *      the everyone-rollout step. Safe server- and client-side.
 *
 *   2. `junebugThreadsEnabledForEmail(email)` — per-user gate. Returns
 *      `true` when the global flag is on OR when the user's email
 *      domain is in `NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS`
 *      (comma-separated). This is the helper used by routes / pages /
 *      nav during the internal-beta step, before we flip globally.
 *
 * Rollout sequence:
 *   - Step A — staging: set `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=true`
 *     on the Preview environment only. No code change.
 *   - Step B — internal beta: set
 *     `NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS=cleared.com` in
 *     production. Global stays `false`. Only staff with a matching
 *     email domain get the feature.
 *   - Step C — everyone: flip
 *     `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=true` in production. Beta
 *     domain var becomes a no-op. Keep it configured so we can
 *     revert to internal-only if needed.
 *
 * Why both vars are `NEXT_PUBLIC_`: the email-domain check has to run
 * inside client components (sidebar nav, in-page chat panels) as well
 * as on the server. A strictly server-only beta list would force a
 * prop-drill of `email` into every client component that touches
 * Junebug. The domain list ("cleared.com") isn't secret — practitioner
 * emails are already part of the NextAuth session cookie — so exposing
 * the list in the client bundle is a worthwhile tradeoff.
 *
 * PR 4 removes both flags entirely. Until then, prefer the email-aware
 * helper everywhere and reserve `junebugThreadsEnabled()` for cases
 * where you cannot get the user's email (e.g. a log line in a cron).
 */

/** Global kill switch. Returns true when the feature is on for everyone. */
export function junebugThreadsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED === "true"
}

/**
 * Per-user gate. Returns true when either:
 *   - the global flag is on, OR
 *   - `email` is non-empty and its domain matches one of
 *     `NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS` (comma-separated,
 *     case-insensitive).
 *
 * An `undefined` / `null` email short-circuits to the global flag only
 * — so anonymous contexts (unauthenticated requests, cron jobs) only
 * see the feature once it's on for everyone.
 */
export function junebugThreadsEnabledForEmail(
  email: string | null | undefined
): boolean {
  if (junebugThreadsEnabled()) return true
  if (!email) return false
  const raw = process.env.NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS
  if (!raw) return false
  const domains = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  if (domains.length === 0) return false
  const emailDomain = email.split("@")[1]?.toLowerCase()
  if (!emailDomain) return false
  return domains.includes(emailDomain)
}
