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
 * Check if a feature request or bug report has been implemented.
 * Uses GitHub code search + commit history + Claude analysis.
 */
export async function detectImplementation(params: {
  subject: string
  body: string
  type: string // BUG_REPORT or FEATURE_REQUEST
}): Promise<DetectionResult> {
  const { subject, body, type } = params

  // Extract search keywords from subject + body
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
    const subjectLower = subject.toLowerCase()
    const bodyLower = body.toLowerCase()
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
