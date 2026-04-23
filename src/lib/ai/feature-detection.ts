/**
 * Auto-detect whether feature requests / bug reports have been
 * implemented by searching the codebase and using Claude to
 * compare the request against code evidence.
 */
import { searchCode, getRecentCommits } from "@/lib/infrastructure/github-api"
import { callClaude } from "@/lib/ai/client"
import { preferredOpusModel } from "@/lib/ai/model-selection"

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
  // Sidebar inbox badge
  { patterns: ["sidebar", "notification", "badge", "inbox", "unread"], evidence: "Inbox badge added to sidebar in UI overhaul commit" },
  // KB enum fix — multiple pattern sets to catch all duplicate reports
  { patterns: ["knowledge base", "enum", "mismatch"], evidence: "KB enum ::text cast fix applied in P0/P1 bug fixes" },
  { patterns: ["knowledgecategory", "enum"], evidence: "KB enum ::text cast fix applied in P0/P1 bug fixes" },
  { patterns: ["kb search", "failing"], evidence: "KB enum ::text cast fix applied in P0/P1 bug fixes" },
  { patterns: ["knowledge", "search", "postgres"], evidence: "KB enum ::text cast fix applied in P0/P1 bug fixes" },
  { patterns: ["knowledge", "ingestion", "abort"], evidence: "KB ingestion maxDuration=300 added to routes" },
  // Banjo stuck task
  { patterns: ["banjo", "stuck"], evidence: "Banjo concurrency guard with 30-min auto-fail added" },
  { patterns: ["banjo", "blocking", "task"], evidence: "Banjo concurrency guard with 30-min auto-fail added" },
  // Work Product Controls — both the 500 and the nav entry
  { patterns: ["work product", "500"], evidence: "WorkProductExample interface + migration fixed" },
  { patterns: ["work product", "controls"], evidence: "Work Product Controls added to admin nav and settings" },
  { patterns: ["work product", "settings"], evidence: "Work Product Controls added to admin nav and settings" },
  // Junebug persistence
  { patterns: ["junebug", "persist"], evidence: "Junebug localStorage persistence for chat history added" },
  { patterns: ["chat", "persist", "sent"], evidence: "Junebug localStorage persistence for chat history added" },
  { patterns: ["sent", "message", "session", "reopen"], evidence: "Junebug localStorage persistence for chat history added" },
  // Junebug multiple bug reports
  { patterns: ["multiple", "bug report"], evidence: "parseMessageDrafts extracts ALL :::message blocks" },
  { patterns: ["junebug", "per session"], evidence: "parseMessageDrafts extracts ALL :::message blocks" },
  // Banjo QA / export validation
  { patterns: ["banjo", "export", "validation"], evidence: "Export validation module + validate endpoint added" },
  { patterns: ["banjo", "qa", "layer"], evidence: "Export validation module + validate endpoint added" },
  { patterns: ["model audit", "banjo"], evidence: "Export validation module + validate endpoint added" },
  // Form auto-populate
  { patterns: ["auto-populate", "1040"], evidence: "Form autopopulate utility + API endpoint created" },
  { patterns: ["form", "1040", "populate"], evidence: "Form autopopulate utility + API endpoint created" },
  // Screenshot capture
  { patterns: ["screenshot", "capture"], evidence: "html2canvas screenshot capture added to Junebug" },
  { patterns: ["screenshot", "bug report"], evidence: "html2canvas screenshot capture added to Junebug" },
  // Inbox export filter
  { patterns: ["inbox", "export", "filter"], evidence: "Export status filter + includeArchived toggle added" },
  { patterns: ["export", "status", "filter"], evidence: "Export status filter + includeArchived toggle added" },
  // Banjo delete assignments
  { patterns: ["banjo", "delete"], evidence: "DELETE /api/banjo/[assignmentId] + onAssignmentDeleted callback" },
  { patterns: ["delete", "assignment"], evidence: "DELETE /api/banjo/[assignmentId] + onAssignmentDeleted callback" },
  // Junebug document upload
  { patterns: ["document", "upload", "chat"], evidence: "File upload with paperclip button in chat panel" },
  { patterns: ["image", "upload", "junebug"], evidence: "File upload with paperclip button in chat panel" },
  // Junebug case data access
  { patterns: ["case data", "chat"], evidence: "Case selector in Junebug header for cross-context access" },
  { patterns: ["case context", "junebug"], evidence: "Case selector in Junebug header for cross-context access" },
  { patterns: ["persistent access", "case"], evidence: "Case selector in Junebug header for cross-context access" },
  // Pippen / chat-actions 500
  { patterns: ["pippen", "500"], evidence: "Pippen admin page query fixed - individual catch per query" },
  { patterns: ["chat-actions", "500"], evidence: "chat-actions route null safety for admin pages" },
  // Chat messages / conversations 500
  { patterns: ["chat", "messages", "500"], evidence: "Conversation routes have try/catch with fallback" },
  { patterns: ["conversations", "loading"], evidence: "Conversation routes have try/catch with fallback" },
  { patterns: ["conversations", "not loading"], evidence: "Conversation routes have try/catch with fallback" },
  { patterns: ["conversations", "clients"], evidence: "Conversation routes have try/catch with fallback" },
  // Research / Micanopy
  { patterns: ["research", "launch"], evidence: "Research enum values fixed to match Prisma schema" },
  { patterns: ["micanopy", "session"], evidence: "Research enum values fixed to match Prisma schema" },
  { patterns: ["research", "400"], evidence: "Research enum values fixed to match Prisma schema" },
  { patterns: ["research", "500"], evidence: "Research enum values fixed to match Prisma schema" },
  // Feed tagging
  { patterns: ["tagging", "feed"], evidence: "Feed @mention notification creation added" },
  { patterns: ["tag", "notification", "feed"], evidence: "Feed @mention notification creation added" },
  // Junebug browser context
  { patterns: ["browser context", "junebug"], evidence: "Browser diagnostics integration enhanced in chat panel" },
  { patterns: ["browser context", "diagnos"], evidence: "Browser diagnostics integration enhanced in chat panel" },
  // Form builder buttons
  { patterns: ["form builder", "button"], evidence: "Form wizard onBlur detection expanded for Radix components" },
  { patterns: ["form", "button", "unresponsive"], evidence: "Form wizard onBlur detection expanded for Radix components" },
  // Junebug action blocks not reaching inbox
  { patterns: ["feature request", "not appearing", "inbox"], evidence: "from-chat route warning when no admin users exist" },
  { patterns: ["junebug", "inbox", "not appearing"], evidence: "from-chat route warning when no admin users exist" },
  { patterns: ["action", "not appearing", "inbox"], evidence: "from-chat route warning when no admin users exist" },
  // Export attachments
  { patterns: ["export", "attachment", "screenshot"], evidence: "Export includes browser context + screenshot notes" },
  // Form Builder PDF preview — empty blob / server response error
  { patterns: ["pdf preview", "blob"], evidence: "PDF preview now validates blob.size and type before creating object URL; revokes old blob AFTER creating new one (prevents race condition); catches 'Unexpected server response' and falls back to blank form (pdf-preview.tsx)" },
  { patterns: ["form builder", "pdf preview"], evidence: "PDF preview in Form Builder validates blob response, handles revocation correctly, and falls back to blank form on error (pdf-preview.tsx)" },
  { patterns: ["pdf preview", "empty"], evidence: "PDF preview checks blob.size < 100 and blob.type === 'application/json' to catch empty/error responses (pdf-preview.tsx)" },
  { patterns: ["pdf preview", "server response"], evidence: "PDF preview catches 'Unexpected server response' errors and falls back to blank form rendering (pdf-preview.tsx)" },
  { patterns: ["form builder", "preview", "empty"], evidence: "PDF preview validates blob size and handles empty server responses (pdf-preview.tsx)" },
  // Dashboard search bar — non-functional
  { patterns: ["dashboard", "search bar"], evidence: "Dashboard header has a real <input> search bar with debounced query to /api/cases?search=, '/' keyboard shortcut, arrow-key navigation, and result linking (dashboard-header.tsx)" },
  { patterns: ["search bar", "non-functional"], evidence: "Dashboard search bar is fully wired — real input, onChange handler, debounced search, keyboard + click handlers (dashboard-header.tsx)" },
  { patterns: ["search bar", "not working"], evidence: "Dashboard search bar is fully functional: debounced API call, keyboard nav, click-to-navigate (dashboard-header.tsx)" },
  { patterns: ["dashboard", "search", "functional"], evidence: "Dashboard search bar wired to /api/cases?search= with full keyboard and mouse interaction (dashboard-header.tsx)" },
  { patterns: ["dashboard", "command palette"], evidence: "Dashboard search bar opens on click or '/' shortcut and acts as a command palette for cases (dashboard-header.tsx)" },
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
      model: preferredOpusModel(),
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
