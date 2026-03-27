/**
 * GitHub Write API — commit files to the Cleared repo.
 * Used by the Junebug → Claude Code feedback pipeline to sync
 * observations and feedback items to TASKS.md.
 *
 * Requires env var: GITHUB_WRITE_TOKEN (or falls back to GITHUB_TOKEN).
 * Uses fetch API directly — no octokit dependency.
 */

const GITHUB_API = "https://api.github.com"
const REPO_OWNER = "HouseofBrandt"
const REPO_NAME = "Clearedwebapp"

function getToken(): string {
  return process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN || ""
}

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  }
}

export async function readFile(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
      headers: headers(),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = Buffer.from(data.content, "base64").toString("utf-8")
    return { content, sha: data.sha }
  } catch {
    return null
  }
}

export async function commitFile(
  path: string,
  content: string,
  message: string
): Promise<{ sha: string } | null> {
  try {
    const existing = await readFile(path)
    const body: Record<string, string> = {
      message,
      content: Buffer.from(content).toString("base64"),
      branch: "main",
    }
    if (existing) body.sha = existing.sha

    const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error("[github-write] commit failed:", await res.text())
      return null
    }
    const data = await res.json()
    return { sha: data.content?.sha || data.commit?.sha }
  } catch (e: any) {
    console.error("[github-write] error:", e.message)
    return null
  }
}

export async function appendToFile(
  path: string,
  newContent: string,
  message: string
): Promise<{ sha: string } | null> {
  const existing = await readFile(path)
  const currentContent = existing?.content || ""
  const updated = currentContent.trimEnd() + "\n\n" + newContent.trim() + "\n"
  return commitFile(path, updated, message)
}
