/**
 * AI Text Humanizer — Post-processing module
 *
 * Removes common AI writing patterns from generated text to make output
 * sound like it was written by a human expert. Based on the 29 patterns
 * from Wikipedia's "Signs of AI writing."
 *
 * Two modes:
 * - humanizeText(): Fast regex pass, no API calls, safe for every output
 * - deepHumanize(): Full Claude rewrite, use sparingly (expensive)
 */

// ── Filler phrase replacements ────────────────────────────────
const FILLER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bIn order to\b/gi, "To"],
  [/\bDue to the fact that\b/gi, "Because"],
  [/\bIt is important to note that\s*/gi, ""],
  [/\bIt is worth noting that\s*/gi, ""],
  [/\bIt should be noted that\s*/gi, ""],
  [/\bAt this point in time\b/gi, "Now"],
  [/\bAt the end of the day\b/gi, "Ultimately"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bhave the ability to\b/gi, "can"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bin the event that\b/gi, "if"],
  [/\bwith regard to\b/gi, "about"],
  [/\bwith respect to\b/gi, "about"],
  [/\bin light of the fact that\b/gi, "because"],
  [/\bon the basis of\b/gi, "based on"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin close proximity to\b/gi, "near"],
  [/\ba significant number of\b/gi, "many"],
  [/\ba wide range of\b/gi, "many"],
  [/\bthe vast majority of\b/gi, "most"],
]

// ── Chatbot artifacts (full-line or sentence-start patterns) ──
const CHATBOT_ARTIFACTS: RegExp[] = [
  /^I hope this helps[.!]?\s*/gim,
  /^Let me know if you (?:have any |need |want ).*?[.!]?\s*/gim,
  /^(?:Here is|Here's) (?:a |an |the ).*?[.:]\s*/gim,
  /^Great question!\s*/gim,
  /^Certainly!\s*/gim,
  /^Of course!\s*/gim,
  /^Absolutely!\s*/gim,
  /^You're absolutely right[.!]?\s*/gim,
  /^That's (?:a |an )?(?:great|excellent|wonderful|fantastic) (?:question|point|observation)[.!]?\s*/gim,
  /^I'd be happy to help[.!]?\s*/gim,
  /^Sure thing!\s*/gim,
  /^Happy to help[.!]?\s*/gim,
]

// ── Significance inflation ────────────────────────────────────
const INFLATION_PATTERNS: RegExp[] = [
  /\bserves as a testament to\b/gi,
  /\bmarks a pivotal moment\b/gi,
  /\bin today's rapidly evolving\b/gi,
  /\bsetting the stage for\b/gi,
  /\bindelible mark\b/gi,
  /\bgame[- ]?changing\b/gi,
  /\bgroundbreaking\b/gi,
  /\bparadigm shift\b/gi,
  /\btransformative (?:impact|effect|change|power)\b/gi,
  /\bunprecedented (?:level|scale|speed)\b/gi,
]

// ── Sycophantic openers (already partially covered above) ─────
const SYCOPHANTIC_OPENERS: RegExp[] = [
  /^Great question!\s*/gim,
  /^That's an excellent point[.!]?\s*/gim,
  /^You're absolutely right[.!]?\s*/gim,
  /^What a (?:great|wonderful|excellent|fantastic) (?:question|idea|point)[.!]?\s*/gim,
]

// ── Signposting / filler transitions ──────────────────────────
const SIGNPOSTING: RegExp[] = [
  /^Let's dive (?:in|into)[.!]?\s*/gim,
  /^Let's explore\b.*?[.!]?\s*/gim,
  /^Let's break this down[.!]?\s*/gim,
  /^Here's what you need to know[.:]\s*/gim,
  /^Without further ado[,.:]\s*/gim,
  /^Let's (?:take a |have a )?(?:look|peek)[.!]?\s*/gim,
  /^Now, let's\b/gim,
]

// ── Copula avoidance (verb inflation) ─────────────────────────
const COPULA_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bserves as\b/gi, "is"],
  [/\bstands as\b/gi, "is"],
  [/\bfunctions as\b/gi, "is"],
  [/\bacts as\b/gi, "is"],
  [/\boperates as\b/gi, "is"],
]

// ── Excessive hedging ─────────────────────────────────────────
const HEDGING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcould potentially possibly be\b/gi, "may be"],
  [/\bcould potentially be\b/gi, "may be"],
  [/\bmight potentially be\b/gi, "may be"],
  [/\bcould possibly be\b/gi, "may be"],
  [/\bit is possible that it could\b/gi, "it may"],
  [/\bit is conceivable that\b/gi, "possibly"],
]

// ── Generic positive conclusions ──────────────────────────────
const GENERIC_CONCLUSIONS: RegExp[] = [
  /\bThe future looks bright\b.*?[.!]\s*/gi,
  /\bExciting times lie ahead\b.*?[.!]\s*/gi,
  /\bOnly time will tell\b.*?[.!]\s*/gi,
  /\bThe possibilities are (?:endless|limitless)\b.*?[.!]\s*/gi,
  /\bThis is just the beginning\b.*?[.!]\s*/gi,
]

// ── Knowledge cutoff disclaimers ──────────────────────────────
const CUTOFF_DISCLAIMERS: RegExp[] = [
  /\bAs of my last (?:update|training|knowledge)\b.*?[.,]\s*/gi,
  /\bWhile (?:specific |exact )?details are (?:limited|unavailable)\b.*?[.,]\s*/gi,
  /\bAs of my knowledge cutoff\b.*?[.,]\s*/gi,
  /\bI don't have (?:access to |information about )(?:real-?time|current)\b.*?[.,]\s*/gi,
  /\bBased on my training data\b.*?[.,]\s*/gi,
]

/**
 * Check if text should be humanized. Returns false for short text,
 * code blocks, JSON, or structured data.
 */
export function shouldHumanize(text: string): boolean {
  if (!text || text.length < 100) return false

  const trimmed = text.trim()

  // JSON objects or arrays
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed)
      return false
    } catch {
      // Not valid JSON, proceed with humanization
    }
  }

  // Primarily code (heuristic: more than 30% of lines start with code-like patterns)
  const lines = trimmed.split("\n")
  const codeLinePatterns = /^\s*(?:\/\/|\/\*|\*|#|import |export |const |let |var |function |class |if |else |for |while |return |def |from |\}|\{|<\/?[a-z])/
  const codeLineCount = lines.filter((l) => codeLinePatterns.test(l)).length
  if (lines.length > 3 && codeLineCount / lines.length > 0.3) return false

  // Fenced code block that spans most of the content
  const fenceMatch = trimmed.match(/^```[\s\S]*```$/m)
  if (fenceMatch && fenceMatch[0].length > trimmed.length * 0.7) return false

  return true
}

/**
 * Reduce em dash overuse: when a paragraph has more than 2 em dashes,
 * replace extras with commas or periods.
 */
function reduceEmDashes(text: string): string {
  return text.replace(/([^\n]+)/g, (paragraph) => {
    const emDashCount = (paragraph.match(/\u2014/g) || []).length
    if (emDashCount <= 2) return paragraph

    // Replace em dashes beyond the first 2 with ", " or ". "
    let replaced = 0
    return paragraph.replace(/\u2014/g, (match) => {
      replaced++
      if (replaced <= 2) return match
      return ", "
    })
  })
}

/**
 * Clean up leftover whitespace issues after pattern removal.
 */
function cleanWhitespace(text: string): string {
  return text
    // Double spaces
    .replace(/  +/g, " ")
    // Space before punctuation
    .replace(/ ([.,;:!?])/g, "$1")
    // Multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    // Lines that are now just whitespace
    .replace(/^\s+$/gm, "")
    // Sentence starting with lowercase after removal (capitalize)
    .replace(/(?:^|\.\s+)([a-z])/gm, (match, letter) => {
      return match.slice(0, -1) + letter.toUpperCase()
    })
    .trim()
}

/**
 * Quick regex pass — fast, no API calls, safe to run on every output.
 * Removes the most common AI writing patterns.
 */
export function humanizeText(text: string): string {
  if (!shouldHumanize(text)) return text

  let result = text

  // Apply filler phrase replacements
  for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }

  // Remove chatbot artifacts
  for (const pattern of CHATBOT_ARTIFACTS) {
    result = result.replace(pattern, "")
  }

  // Remove significance inflation (replace with empty, let sentence restructure)
  for (const pattern of INFLATION_PATTERNS) {
    result = result.replace(pattern, "")
  }

  // Remove sycophantic openers
  for (const pattern of SYCOPHANTIC_OPENERS) {
    result = result.replace(pattern, "")
  }

  // Remove signposting
  for (const pattern of SIGNPOSTING) {
    result = result.replace(pattern, "")
  }

  // Apply copula replacements
  for (const [pattern, replacement] of COPULA_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }

  // Apply hedging replacements
  for (const [pattern, replacement] of HEDGING_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }

  // Remove generic positive conclusions
  for (const pattern of GENERIC_CONCLUSIONS) {
    result = result.replace(pattern, "")
  }

  // Remove knowledge cutoff disclaimers
  for (const pattern of CUTOFF_DISCLAIMERS) {
    result = result.replace(pattern, "")
  }

  // Reduce em dash overuse
  result = reduceEmDashes(result)

  // Clean up whitespace artifacts
  result = cleanWhitespace(result)

  return result
}

/**
 * Full humanizer with Claude rewrite — use sparingly (expensive).
 * Falls back to regex humanizeText() if the API call fails.
 */
export async function deepHumanize(text: string): Promise<string> {
  if (!shouldHumanize(text)) return text

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20241022",
      max_tokens: Math.max(2048, Math.ceil(text.length / 2)),
      temperature: 0.4,
      system: "You are a writing editor. Rewrite this text to remove AI writing patterns. Keep the same meaning and facts. Make it sound like a human expert wrote it. Be direct, use simple constructions, vary sentence length. No filler, no puffery, no signposting. Return only the rewritten text — no commentary, no preamble.",
      messages: [{ role: "user", content: text }],
    })

    const rewritten = response.content.find((c) => c.type === "text")
    if (rewritten && rewritten.text.length > 0) {
      return rewritten.text
    }

    // Empty response — fall back to regex
    return humanizeText(text)
  } catch (error) {
    console.warn("[Humanizer] Deep humanize API call failed, falling back to regex:", error)
    return humanizeText(text)
  }
}
