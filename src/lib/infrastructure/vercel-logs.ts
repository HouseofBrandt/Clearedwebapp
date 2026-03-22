/**
 * Fetch runtime logs and deployment info from Vercel REST API.
 * Requires env vars: VERCEL_TOKEN, VERCEL_PROJECT_ID,
 * optionally VERCEL_TEAM_ID.
 */

const VERCEL_TOKEN = () => process.env.VERCEL_TOKEN || ""
const VERCEL_PROJECT_ID = () => process.env.VERCEL_PROJECT_ID || ""
const VERCEL_TEAM_ID = () => process.env.VERCEL_TEAM_ID || ""

function teamParam(): string {
  const id = VERCEL_TEAM_ID()
  return id ? `&teamId=${id}` : ""
}

function sanitizeUrl(url: string): string {
  const token = VERCEL_TOKEN()
  if (token) {
    return url.replace(token, "REDACTED")
  }
  return url
}

async function vercelFetch(path: string): Promise<any> {
  const token = VERCEL_TOKEN()
  const projectId = VERCEL_PROJECT_ID()

  if (!token || !projectId) {
    const missing: string[] = []
    if (!token) missing.push("VERCEL_TOKEN")
    if (!projectId) missing.push("VERCEL_PROJECT_ID")
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }

  const fullUrl = `https://api.vercel.com${path}`
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    if (res.status === 404) {
      throw new Error(
        `Vercel API 404 Not Found: ${sanitizeUrl(fullUrl)} — ${text.substring(0, 200)}`
      )
    }
    throw new Error(`Vercel API ${res.status}: ${text.substring(0, 200)}`)
  }
  return res.json()
}

// ── Health Check ──

export interface VercelHealthCheckResult {
  configured: boolean
  connected: boolean
  envVars: {
    token: boolean
    projectId: boolean
    teamId: boolean
  }
  error?: string
}

export async function vercelHealthCheck(): Promise<VercelHealthCheckResult> {
  const token = VERCEL_TOKEN()
  const projectId = VERCEL_PROJECT_ID()
  const teamId = VERCEL_TEAM_ID()

  const envVars = {
    token: !!token,
    projectId: !!projectId,
    teamId: !!teamId,
  }

  const configured = !!token && !!projectId

  if (!configured) {
    return {
      configured,
      connected: false,
      envVars,
      error: `Missing env vars: ${[
        !token && "VERCEL_TOKEN",
        !projectId && "VERCEL_PROJECT_ID",
      ].filter(Boolean).join(", ")}`,
    }
  }

  try {
    // Use the deployments endpoint as a known-working test call
    await vercelFetch(
      `/v6/deployments?projectId=${projectId}&limit=1${teamParam()}`
    )
    return { configured, connected: true, envVars }
  } catch (err: any) {
    return {
      configured,
      connected: false,
      envVars,
      error: err.message,
    }
  }
}

// ── Logs ──

export interface VercelLogEntry {
  timestamp: string
  message: string
  source: string
  level: string
  path?: string
  statusCode?: number
}

function mapLogEntries(data: any): VercelLogEntry[] {
  return (data.logs || data || []).map((e: any) => ({
    timestamp: new Date(e.timestamp || e.createdAt || e.created || Date.now()).toISOString(),
    message: (e.message || e.text || e.payload?.text || "").substring(0, 500),
    source: e.source || e.type || "runtime",
    level: e.level || "info",
    path: e.requestPath || e.path || e.proxy?.path,
    statusCode: e.statusCode || e.proxy?.statusCode,
  }))
}

export async function fetchRecentLogs(options?: {
  limit?: number
  since?: number
}): Promise<{ logs: VercelLogEntry[]; error?: string }> {
  const projectId = VERCEL_PROJECT_ID()
  if (!projectId) return { logs: [], error: "VERCEL_PROJECT_ID not set" }

  const limit = options?.limit || 50
  const since = options?.since || Date.now() - 30 * 60 * 1000

  // Primary: v3 runtime logs endpoint
  try {
    const data = await vercelFetch(
      `/v3/runtime/logs?projectId=${projectId}&since=${since}&limit=${limit}${teamParam()}`
    )
    return { logs: mapLogEntries(data) }
  } catch (primaryErr: any) {
    // Only attempt fallback if the primary returned 404
    if (!primaryErr.message?.includes("404")) {
      return { logs: [], error: primaryErr.message }
    }
  }

  // Fallback: fetch the latest deployment, then get its events
  try {
    const deployData = await vercelFetch(
      `/v6/deployments?projectId=${projectId}&limit=1${teamParam()}`
    )
    const latestDeployment = deployData.deployments?.[0]
    if (!latestDeployment) {
      return { logs: [], error: "No deployments found for fallback log fetch" }
    }

    const deploymentId = latestDeployment.uid || latestDeployment.id
    const teamQuery = VERCEL_TEAM_ID() ? `?teamId=${VERCEL_TEAM_ID()}` : ""
    const eventsData = await vercelFetch(
      `/v2/deployments/${deploymentId}/events${teamQuery}`
    )

    const logs: VercelLogEntry[] = (eventsData || [])
      .filter((e: any) => e.type === "stdout" || e.type === "stderr" || e.type === "request")
      .slice(-limit)
      .map((e: any) => ({
        timestamp: new Date(e.created || e.timestamp || Date.now()).toISOString(),
        message: (e.payload?.text || e.text || e.message || "").substring(0, 500),
        source: e.type || "runtime",
        level: e.type === "stderr" ? "error" : "info",
        path: e.payload?.requestPath || e.payload?.path,
        statusCode: e.payload?.statusCode,
      }))

    return { logs }
  } catch (fallbackErr: any) {
    return {
      logs: [],
      error: `Primary (v3/runtime/logs) and fallback (v2/deployments/events) both failed. Last error: ${fallbackErr.message}`,
    }
  }
}

// ── Deployments ──

export interface VercelDeployment {
  id: string
  url: string
  state: string
  createdAt: string
  commitMessage?: string
  branch?: string
}

export async function fetchDeployments(limit = 5): Promise<{
  deployments: VercelDeployment[]
  error?: string
}> {
  const projectId = VERCEL_PROJECT_ID()
  if (!projectId) return { deployments: [], error: "VERCEL_PROJECT_ID not set" }

  try {
    const data = await vercelFetch(
      `/v6/deployments?projectId=${projectId}&limit=${limit}${teamParam()}`
    )

    const deployments: VercelDeployment[] = (data.deployments || []).map((d: any) => ({
      id: d.uid || d.id,
      url: d.url,
      state: d.state || d.readyState,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : "",
      commitMessage: d.meta?.githubCommitMessage,
      branch: d.meta?.githubCommitRef,
    }))

    return { deployments }
  } catch (err: any) {
    return { deployments: [], error: err.message }
  }
}

// ── Build Logs ──

export async function fetchBuildLogs(deploymentId: string): Promise<{
  logs: string[]
  error?: string
}> {
  try {
    const data = await vercelFetch(
      `/v2/deployments/${deploymentId}/events${teamParam() ? `?${teamParam().substring(1)}` : ""}`
    )

    const logs = (data || [])
      .filter((e: any) => e.type === "stdout" || e.type === "stderr")
      .map((e: any) => {
        const time = e.created ? new Date(e.created).toLocaleTimeString() : ""
        return `[${time}] ${e.payload?.text || e.text || ""}`
      })
      .slice(-30)

    return { logs }
  } catch (err: any) {
    return { logs: [], error: err.message }
  }
}
