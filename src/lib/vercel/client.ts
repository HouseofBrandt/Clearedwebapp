/**
 * Vercel REST API client — thin, read-only, scoped to what Junebug's
 * Full Fetch "Jarvis" mode needs to see (latest deployment + its build
 * logs + recent runtime events for the practitioner's current page).
 *
 * Security notes:
 *   - Server-side only. Every function here reads
 *     `process.env.VERCEL_API_TOKEN` which is a powerful credential
 *     — never bundle this module into a client chunk.
 *   - Requires `VERCEL_PROJECT_ID` (the production project to read).
 *     `VERCEL_TEAM_ID` is optional; required only for team-scoped tokens.
 *   - Read-only: no deploy, no env-var mutation, no cache bust. If a
 *     future caller needs those, put them in a separate module so the
 *     blast radius of an import mistake is small.
 *   - Short timeouts + zero retries. If Vercel is down or slow we'd
 *     rather tell Junebug "diagnostics unavailable" than hold up the
 *     practitioner's turn.
 *
 * Token setup:
 *   - Vercel dashboard → Account Settings → Tokens → Create token.
 *   - Scope to the project (or team if multi-project).
 *   - Add to Vercel production env as `VERCEL_API_TOKEN`.
 *   - `VERCEL_PROJECT_ID` is visible in the project settings URL; add
 *     it to env alongside the token.
 *
 * When the token / project id aren't configured, `isConfigured()`
 * returns false and `getDeploymentSnapshot()` returns null. Full Fetch
 * falls through without a block of "Vercel diagnostics unavailable"
 * noise in the prompt.
 */

const VERCEL_API_BASE = "https://api.vercel.com"
const REQUEST_TIMEOUT_MS = 5_000
const BUILD_LOG_LINE_LIMIT = 40
const RUNTIME_EVENT_LIMIT = 20

export interface VercelDeploymentSnapshot {
  id: string
  url: string | null
  inspectorUrl: string | null
  state: string | null
  readyState: string | null
  target: string | null
  createdAt: string | null
  buildingAt: string | null
  readyAt: string | null
  source: string | null
  commitMessage: string | null
  commitSha: string | null
  errorMessage: string | null
}

export interface VercelDiagnostics {
  deployment: VercelDeploymentSnapshot | null
  buildLogLines: string[]
  runtimeEvents: Array<{ level: string; text: string; at: string | null }>
  /** Human-readable reason when data is partial (e.g. "runtime events unavailable"). */
  partialReason: string | null
}

export function isConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID
  )
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
  }
}

function teamQuery(): string {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `&teamId=${encodeURIComponent(team)}` : ""
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Load the latest production deployment plus a trailing slice of its
 * build log and recent runtime events. Returns null when not configured
 * or when the deployment list is empty / Vercel errors out.
 *
 * This is intentionally conservative: partial data is fine (the
 * practitioner can still reason about "is the latest deploy green?"
 * even if runtime events aren't available on this plan / region).
 */
export async function getDeploymentSnapshot(): Promise<VercelDiagnostics | null> {
  if (!isConfigured()) return null

  const projectId = process.env.VERCEL_PROJECT_ID!
  let partialReason: string | null = null

  let deployment: VercelDeploymentSnapshot | null = null
  try {
    const res = await fetchWithTimeout(
      `${VERCEL_API_BASE}/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1${teamQuery()}`,
      { headers: authHeaders() }
    )
    if (!res.ok) {
      return null
    }
    const json: any = await res.json()
    const latest = json?.deployments?.[0]
    if (latest) {
      deployment = {
        id: latest.uid || latest.id || "",
        url: latest.url || null,
        inspectorUrl: latest.inspectorUrl || null,
        state: latest.state || null,
        readyState: latest.readyState || null,
        target: latest.target || null,
        createdAt: latest.created ? new Date(latest.created).toISOString() : null,
        buildingAt: latest.buildingAt
          ? new Date(latest.buildingAt).toISOString()
          : null,
        readyAt: latest.ready ? new Date(latest.ready).toISOString() : null,
        source: latest.source || null,
        commitMessage:
          latest.meta?.githubCommitMessage ||
          latest.meta?.gitlabCommitMessage ||
          latest.meta?.bitbucketCommitMessage ||
          null,
        commitSha:
          latest.meta?.githubCommitSha ||
          latest.meta?.gitlabCommitSha ||
          latest.meta?.bitbucketCommitSha ||
          null,
        errorMessage: latest.errorMessage || null,
      }
    }
  } catch {
    return null
  }

  if (!deployment) return null

  // Build log tail. v3 events endpoint accepts `builds=1` which filters
  // to build-phase events; we slice the tail to keep the prompt size
  // bounded. If the call fails we note it in `partialReason` but still
  // return the deployment metadata.
  let buildLogLines: string[] = []
  try {
    const res = await fetchWithTimeout(
      `${VERCEL_API_BASE}/v3/deployments/${encodeURIComponent(deployment.id)}/events?builds=1${teamQuery()}`,
      { headers: authHeaders() }
    )
    if (res.ok) {
      const json: any = await res.json()
      const rows: any[] = Array.isArray(json) ? json : json?.events ?? []
      buildLogLines = rows
        .slice(-BUILD_LOG_LINE_LIMIT)
        .map((e: any) => {
          const text = typeof e?.payload?.text === "string" ? e.payload.text : ""
          return text.replace(/\u001b\[[0-9;]*m/g, "").trim() // strip ANSI colors
        })
        .filter(Boolean)
    } else {
      partialReason = "build logs unavailable (Vercel API error)"
    }
  } catch {
    partialReason = "build logs unavailable (request timed out)"
  }

  // Runtime events. Not every Vercel plan exposes this; if the call
  // 401/403s we silently fall through. The token may also be scoped
  // without runtime-log permission — handled the same way.
  let runtimeEvents: VercelDiagnostics["runtimeEvents"] = []
  try {
    const res = await fetchWithTimeout(
      `${VERCEL_API_BASE}/v2/deployments/${encodeURIComponent(deployment.id)}/events?limit=${RUNTIME_EVENT_LIMIT}${teamQuery()}`,
      { headers: authHeaders() }
    )
    if (res.ok) {
      const json: any = await res.json()
      const rows: any[] = Array.isArray(json) ? json : json?.events ?? []
      runtimeEvents = rows.slice(-RUNTIME_EVENT_LIMIT).map((e: any) => ({
        level: String(e?.type || e?.level || "info"),
        text: typeof e?.payload?.text === "string" ? e.payload.text : "",
        at: e?.created ? new Date(e.created).toISOString() : null,
      }))
    }
  } catch {
    // Silent — runtime logs are a nice-to-have.
  }

  return { deployment, buildLogLines, runtimeEvents, partialReason }
}

/**
 * Format a diagnostics packet for injection into the system prompt.
 * Keeps the footprint small — one header, the deployment state in one
 * line, the last N build log lines, and the last N runtime events.
 */
export function formatDiagnosticsForPrompt(
  d: VercelDiagnostics
): string {
  const dep = d.deployment
  if (!dep) return ""

  const state = dep.readyState || dep.state || "UNKNOWN"
  const stateLine = `Latest deployment: ${dep.id.slice(0, 12)} · target=${dep.target || "production"} · state=${state}${
    dep.commitMessage ? ` · "${dep.commitMessage.slice(0, 80)}"` : ""
  }${dep.commitSha ? ` · sha=${dep.commitSha.slice(0, 7)}` : ""}`

  const timings = [
    dep.createdAt ? `created ${dep.createdAt}` : null,
    dep.buildingAt ? `building ${dep.buildingAt}` : null,
    dep.readyAt ? `ready ${dep.readyAt}` : null,
  ]
    .filter(Boolean)
    .join(" → ")

  let ctx = `

VERCEL DEPLOYMENT SNAPSHOT (live — pulled at send time):
${stateLine}${timings ? `\n${timings}` : ""}`

  if (dep.errorMessage) {
    ctx += `\n⚠ Deployment reported error: ${dep.errorMessage.slice(0, 400)}`
  }

  if (d.buildLogLines.length > 0) {
    ctx += `\n\nRecent build log (last ${d.buildLogLines.length} lines):\n${d.buildLogLines.join("\n")}`
  }

  if (d.runtimeEvents.length > 0) {
    ctx += `\n\nRecent runtime events:\n${d.runtimeEvents
      .map((e) => `- [${e.level}] ${e.text.slice(0, 240)}${e.at ? ` (${e.at})` : ""}`)
      .join("\n")}`
  }

  if (d.partialReason) {
    ctx += `\n\nNote: ${d.partialReason}.`
  }

  ctx += `\n\nWhen the practitioner asks about deploy status, build failures, or server errors, ground your answer in the above. If the state is READY and the log shows no errors, say so plainly.`

  return ctx
}
