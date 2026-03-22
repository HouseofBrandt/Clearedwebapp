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

async function vercelFetch(path: string): Promise<any> {
  const token = VERCEL_TOKEN()
  if (!token) throw new Error("VERCEL_TOKEN not set")
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Vercel API ${res.status}: ${text.substring(0, 200)}`)
  }
  return res.json()
}

export interface VercelLogEntry {
  timestamp: string
  message: string
  source: string
  level: string
  path?: string
  statusCode?: number
}

export async function fetchRecentLogs(options?: {
  limit?: number
  since?: number
}): Promise<{ logs: VercelLogEntry[]; error?: string }> {
  const projectId = VERCEL_PROJECT_ID()
  if (!projectId) return { logs: [], error: "VERCEL_PROJECT_ID not set" }

  try {
    const limit = options?.limit || 50
    const since = options?.since || Date.now() - 30 * 60 * 1000

    const data = await vercelFetch(
      `/v1/projects/${projectId}/logs?limit=${limit}&since=${since}${teamParam()}`
    )

    const logs: VercelLogEntry[] = (data.logs || data || []).map((e: any) => ({
      timestamp: new Date(e.timestamp || e.createdAt || Date.now()).toISOString(),
      message: (e.message || e.text || "").substring(0, 500),
      source: e.source || e.type || "runtime",
      level: e.level || "info",
      path: e.requestPath || e.path || e.proxy?.path,
      statusCode: e.statusCode || e.proxy?.statusCode,
    }))

    return { logs }
  } catch (err: any) {
    return { logs: [], error: err.message }
  }
}

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
