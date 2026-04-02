/**
 * Auto-detect whether feature requests / bug reports have been
 * implemented by searching the codebase and using Claude to
 * compare the request against code evidence.
 */
import { searchCode, getRecentCommits } from "@/lib/infrastructure/github-api"
import { callClaude } from "@/lib/ai/client"

export interface DetectionResult {
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE"
  evidence: string
  matchedFiles: string[]
  matchedCommits: string[]
}

/**
 * Hardcoded mapping of known implementations. Each entry contains keyword
 * patterns and evidence text. If at least 2 patterns match the subject+body,
 * the item is considered implemented with HIGH confidence.
 */
const KNOWN_IMPLEMENTATIONS: Array<{ patterns: string[]; evidence: string }> = [
  { patterns: ["sidebar", "notification", "badge", "inbox", "unread"], evidence: "Inbox badge added to sidebar in UI overhaul commit" },
  { patterns: ["knowledge base", "enum", "mismatch", "knowledgecategory", "kb search"], evidence: "KB enum ::text cast fix applied in P0/P1 bug fixes" },
  { patterns: ["banjo", "stuck", "blocking", "cancel"], evidence: "Banjo concurrency guard with 30-min auto-fail added" },
  { patterns: ["work product", "controls", "settings", "navigation", "nav"], evidence: "Work Product Controls added to admin nav and settings" },
  { patterns: ["junebug", "persist", "sent", "message", "session"], evidence: "Junebug localStorage persistence for chat history added" },
  { patterns: ["junebug", "multiple", "bug report", "per session", "draft"], evidence: "parseMessageDrafts extracts ALL :::message blocks" },
  { patterns: ["banjo", "export", "validation", "qa", "pre-export"], evidence: "Export validation module + validate endpoint added" },
  { patterns: ["form", "auto-populate", "1040", "autopopulate"], evidence: "Form autopopulate utility + API endpoint created" },
  { patterns: ["screenshot", "capture", "html2canvas", "bug report"], evidence: "html2canvas screenshot capture added to Junebug" },
  { patterns: ["inbox", "export", "filter", "status", "implemented"], evidence: "Export status filter + includeArchived toggle added" },
  { patterns: ["banjo", "delete", "assignment", "previous"], evidence: "DELETE /api/banjo/[assignmentId] + onAssignmentDeleted callback" },
  { patterns: ["junebug", "document", "upload", "image", "chat", "paperclip"], evidence: "File upload with paperclip button in chat panel" },
  { patterns: ["junebug", "case data", "case context", "all contexts", "case selector"], evidence: "Case selector in Junebug header for cross-context access" },
  { patterns: ["pippen", "tax authority", "500", "chat-actions"], evidence: "Pippen admin page query fixed - individual catch per query" },
  { patterns: ["chat messages", "conversations", "500", "messages endpoint"], evidence: "Conversation routes have try/catch with fallback" },
  { patterns: ["research", "launch", "session", "micanopy", "400"], evidence: "Research enum values fixed to match Prisma schema" },
  { patterns: ["work product", "api", "500", "sourcefilename"], evidence: "WorkProductExample interface updated with source file fields" },
  { patterns: ["feed", "tagging", "mention", "notification", "@"], evidence: "Feed @mention notification creation added" },
  { patterns: ["junebug", "browser context", "diagnostics"], evidence: "Browser diagnostics integration exists in chat panel" },
]

/**
 * Check subject+body against known implementation patterns.
 * Returns a HIGH-confidence result if at least 2 patterns match,
 * or null if no known implementation is matched.
 */
export function checkKnownImplementations(subject: string, body: string): DetectionResult | null {
  const text = `${subject} ${body}`.toLowerCase()

  for (const entry of KNOWN_IMPLEMENTATIONS) {
    const matchCount = entry.patterns.filter(p => text.includes(p)).length
    if (matchCount >= 2) {
      return {
        confidence: "HIGH",
        evidence: entry.evidence,
        matchedFiles: [],
        matchedCommits: [],
      }
    }
  }

  return null
}

/**
 * Check if a feature request or bug report has been implemented.
 * First checks against known implementations (no external dependencies),
 * then falls back to GitHub code search + commit history + Claude analysis.
 */
export async function detectImplementation(params: {
  subject: string
  body: string
  type: string // BUG_REPORT or FEATURE_REQUEST
}): Promise<DetectionResult> {
  const { subject, body, type } = params

  // 1. Check known implementations first (works without GITHUB_TOKEN)
  const knownResult = checkKnownImplementations(subject, body)
  if (knownResult) {
    return knownResult
  }

  // 2. If GITHUB_TOKEN is not available, skip GitHub-dependent checks
  if (!process.env.GITHUB_TOKEN) {
    return { confidence: "NONE", evidence: "No known implementation match and GITHUB_TOKEN not available", matchedFiles: [], matchedCommits: [] }
  }

  // 3. Extract search keywords from subject + body
  const keywords = extractKeywords(subject + " " + body)
  if (keywords.length === 0) {
    return { confidence: "NONE", evidence: "Could not extract search terms", matchedFiles: [], matchedCommits: [] }
  }

  // Search codebase for evidence
  const allFiles: string[] = []
  const allMatches: string[] = []

  for (const kw of keywords.slice(0, 3)) {
    try {
      const { results } = await searchCode(kw, { path: "src", maxResults: 5 })
      for (const r of results) {
        if (!allFiles.includes(r.file)) allFiles.push(r.file)
        for (const m of r.matches.slice(0, 2)) {
          allMatches.push(`${r.file}: ${m.substring(0, 200)}`)
        }
      }
    } catch {}
  }

  // Search recent commits for evidence
  const matchedCommits: string[] = []
  try {
    const { commits } = await getRecentCommits({ limit: 30 })
    for (const c of commits) {
      const msgLower = c.message.toLowerCase()
      // Check if commit message references keywords from the request
      if (keywords.some(kw => msgLower.includes(kw.toLowerCase()))) {
        matchedCommits.push(`${c.sha} ${c.date} ${c.message}`)
      }
    }
  } catch {}

  // If no code evidence at all, it's likely not implemented
  if (allFiles.length === 0 && matchedCommits.length === 0) {
    return { confidence: "NONE", evidence: "No code evidence found", matchedFiles: [], matchedCommits: [] }
  }

  // Use Claude to assess whether the evidence matches the request
  try {
    const assessment = await callClaude({
      systemPrompt: `You are a code reviewer. Given a feature request or bug report and code search results from the repository, determine if the feature/fix has been implemented. Respond with EXACTLY this JSON format:
{"confidence":"HIGH"|"MEDIUM"|"LOW"|"NONE","summary":"one sentence explanation"}
HIGH = clearly implemented (matching files, functions, or commits directly address the request)
MEDIUM = likely implemented (related code exists but not a perfect match)
LOW = possibly related code but unclear
NONE = no evidence of implementation`,
      userMessage: `${type}: "${subject}"
Description: ${body.substring(0, 500)}

Code search results (${allFiles.length} files):
${allMatches.slice(0, 10).join("\n")}

Related commits (${matchedCommits.length}):
${matchedCommits.slice(0, 5).join("\n")}`,
      model: "claude-opus-4-6",
      maxTokens: 200,
      temperature: 0,
    })

    const parsed = JSON.parse(assessment.content.replace(/```json\n?|\n?```/g, "").trim())
    return {
      confidence: parsed.confidence || "LOW",
      evidence: parsed.summary || "AI assessment completed",
      matchedFiles: allFiles.slice(0, 10),
      matchedCommits: matchedCommits.slice(0, 5),
    }
  } catch {
    // If Claude call fails, fall back to heuristic
    const confidence = allFiles.length >= 3 || matchedCommits.length >= 2 ? "MEDIUM" : "LOW"
    return {
      confidence,
      evidence: `Found ${allFiles.length} matching files and ${matchedCommits.length} related commits (AI assessment unavailable)`,
      matchedFiles: allFiles.slice(0, 10),
      matchedCommits: matchedCommits.slice(0, 5),
    }
  }
}

function extractKeywords(text: string): string[] {
  // Remove common words, extract meaningful terms
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "why", "how",
    "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "don", "should", "now", "and", "but", "or",
    "if", "that", "this", "it", "its", "i", "we", "they", "them",
    "feature", "request", "bug", "report", "implement", "add", "fix",
    "please", "want", "like", "make", "get", "set", "update",
  ])

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8)
}
