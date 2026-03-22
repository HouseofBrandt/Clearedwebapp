/**
 * Read-only access to the Cleared codebase via GitHub REST API.
 * Requires env var: GITHUB_TOKEN (fine-grained PAT with
 * Contents: read permission on the repo).
 *
 * Junebug uses this to:
 * - Read specific source files to diagnose bugs
 * - Check if features have been implemented
 * - List recent commits to see what changed
 * - Search the codebase for specific patterns
 */

const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN || ""
const REPO_OWNER = () => process.env.GITHUB_REPO_OWNER || "HouseofBrandt"
const REPO_NAME = () => process.env.GITHUB_REPO_NAME || "Clearedwebapp"

async function githubFetch(path: string): Promise<any> {
  const token = GITHUB_TOKEN()
  if (!token) throw new Error("GITHUB_TOKEN not set")

  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cleared-Junebug",
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GitHub API ${res.status}: ${text.substring(0, 200)}`)
  }

  return res.json()
}

/**
 * Get contents of a specific file from the repo.
 * Returns the decoded text content (up to maxLength chars).
 */
export async function getFileContents(
  filePath: string,
  options?: { branch?: string; maxLength?: number }
): Promise<{ content: string; size: number; sha: string; error?: string }> {
  try {
    const ref = options?.branch || "main"
    const data = await githubFetch(
      `/repos/${REPO_OWNER()}/${REPO_NAME()}/contents/${filePath}?ref=${ref}`
    )

    if (data.type !== "file") {
      return { content: "", size: 0, sha: "", error: `${filePath} is a ${data.type}, not a file` }
    }

    const decoded = Buffer.from(data.content, "base64").toString("utf-8")
    const maxLen = options?.maxLength || 8000
    const truncated = decoded.length > maxLen
      ? decoded.substring(0, maxLen) + `\n\n... [truncated — file is ${decoded.length} chars, showing first ${maxLen}]`
      : decoded

    return {
      content: truncated,
      size: data.size,
      sha: data.sha,
    }
  } catch (err: any) {
    return { content: "", size: 0, sha: "", error: err.message }
  }
}

/**
 * List files in a directory.
 */
export async function listDirectory(
  dirPath: string,
  branch?: string
): Promise<{ files: Array<{ name: string; type: string; size: number; path: string }>; error?: string }> {
  try {
    const ref = branch || "main"
    const data = await githubFetch(
      `/repos/${REPO_OWNER()}/${REPO_NAME()}/contents/${dirPath}?ref=${ref}`
    )

    if (!Array.isArray(data)) {
      return { files: [], error: `${dirPath} is not a directory` }
    }

    const files = data.map((f: any) => ({
      name: f.name,
      type: f.type,
      size: f.size || 0,
      path: f.path,
    }))

    return { files }
  } catch (err: any) {
    return { files: [], error: err.message }
  }
}

/**
 * Search the codebase for a specific string or pattern.
 * Uses GitHub code search API.
 */
export async function searchCode(
  query: string,
  options?: { extension?: string; path?: string; maxResults?: number }
): Promise<{
  results: Array<{ file: string; matches: string[] }>
  totalCount: number
  error?: string
}> {
  try {
    let q = `${query} repo:${REPO_OWNER()}/${REPO_NAME()}`
    if (options?.extension) q += ` extension:${options.extension}`
    if (options?.path) q += ` path:${options.path}`

    const data = await githubFetch(
      `/search/code?q=${encodeURIComponent(q)}&per_page=${options?.maxResults || 10}`
    )

    const results = (data.items || []).map((item: any) => ({
      file: item.path,
      matches: (item.text_matches || []).map((m: any) =>
        m.fragment?.substring(0, 300) || ""
      ),
    }))

    return { results, totalCount: data.total_count || 0 }
  } catch (err: any) {
    return { results: [], totalCount: 0, error: err.message }
  }
}

/**
 * Get recent commits (default: last 10).
 */
export async function getRecentCommits(
  options?: { branch?: string; limit?: number; since?: string }
): Promise<{
  commits: Array<{
    sha: string
    message: string
    author: string
    date: string
    filesChanged?: number
  }>
  error?: string
}> {
  try {
    const params = new URLSearchParams()
    if (options?.branch) params.set("sha", options.branch)
    params.set("per_page", String(options?.limit || 10))
    if (options?.since) params.set("since", options.since)

    const data = await githubFetch(
      `/repos/${REPO_OWNER()}/${REPO_NAME()}/commits?${params.toString()}`
    )

    const commits = (data || []).map((c: any) => ({
      sha: c.sha?.substring(0, 7),
      message: c.commit?.message?.split("\n")[0]?.substring(0, 120) || "",
      author: c.commit?.author?.name || c.author?.login || "",
      date: c.commit?.author?.date || "",
      filesChanged: c.stats?.total,
    }))

    return { commits }
  } catch (err: any) {
    return { commits: [], error: err.message }
  }
}

/**
 * Get a specific commit's details including changed files.
 */
export async function getCommitDetails(sha: string): Promise<{
  message: string
  files: Array<{ filename: string; status: string; changes: number }>
  error?: string
}> {
  try {
    const data = await githubFetch(
      `/repos/${REPO_OWNER()}/${REPO_NAME()}/commits/${sha}`
    )

    return {
      message: data.commit?.message || "",
      files: (data.files || []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        changes: f.changes || 0,
      })),
    }
  } catch (err: any) {
    return { message: "", files: [], error: err.message }
  }
}

/**
 * Get the repo file tree (recursive, for overview).
 * Only returns src/ files to keep it manageable.
 */
export async function getFileTree(branch?: string): Promise<{
  files: string[]
  totalFiles: number
  error?: string
}> {
  try {
    const ref = branch || "main"
    const data = await githubFetch(
      `/repos/${REPO_OWNER()}/${REPO_NAME()}/git/trees/${ref}?recursive=1`
    )

    const allFiles = (data.tree || [])
      .filter((f: any) => f.type === "blob")
      .map((f: any) => f.path)

    const srcFiles = allFiles.filter((f: string) =>
      f.startsWith("src/") || f === "prisma/schema.prisma" ||
      f === "next.config.js" || f === "package.json"
    )

    return { files: srcFiles, totalFiles: allFiles.length }
  } catch (err: any) {
    return { files: [], totalFiles: 0, error: err.message }
  }
}
