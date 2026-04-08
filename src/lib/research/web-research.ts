import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"
import { humanizeText } from "@/lib/ai/humanizer"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

const VALID_KB_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const
type KnowledgeCategory = typeof VALID_KB_CATEGORIES[number]

export interface ResearchRequest {
  topic: string
  context?: string
  scope: "narrow" | "broad"
  saveToKB?: boolean
  kbCategory?: string
  kbTags?: string[]
  userId?: string
}

export interface ResearchResult {
  summary: string
  sources: Array<{ title: string; url: string; snippet: string }>
  fullText: string
  savedToKB?: { documentId: string; title: string }
}

export async function conductResearch(request: ResearchRequest): Promise<ResearchResult> {
  const systemPrompt = `You are a tax law researcher for a licensed tax resolution firm. You have web search access. Your job is to find the most current, authoritative information on the given topic.

RESEARCH STANDARDS:
- Prioritize primary sources: IRS.gov, irs.gov/irm, law.cornell.edu, ustaxcourt.gov
- Cite specific IRC sections, Treasury Regulations, IRM sections, and Revenue Procedures
- Note the date of any guidance to assess currency
- If you find conflicting information, present both sides with citations
- Be thorough but focused — the practitioners are experts who need precision, not explanations of basics

CRITICAL — OUTPUT RULES:
- Start IMMEDIATELY with the research memo. NO preamble. NO "I'll research this..." or "Let me search..." or "Let me compile..." — those are internal thoughts, not output.
- Do NOT narrate your search process. The user sees your searches separately. Just produce the memo.
- Write in a clear, professional but readable tone — not dry academic writing. Use short paragraphs, bold key terms, and plain English where possible.
- Address the practitioner directly when relevant ("In your client's case..." or "The strongest argument here is...")

OUTPUT FORMAT:
Provide your findings as a structured research memo:

## Summary
2-3 sentences answering the question directly. Lead with the bottom line.

## Current Guidance
The authoritative answer with full citations. Use subsections (### headings) for distinct authorities.

## Recent Changes
Any updates in the last 12 months. If none, say so briefly.

## Practitioner Notes
Strategic considerations, caveats, open questions. This is where you add real value — not just what the law says, but what a practitioner should *do* about it.

## Sources
List of authorities and URLs consulted.

If the topic is ${request.scope === "narrow" ? "specific — answer it directly and concisely" : "broad — survey the landscape and identify key authorities"}.`

  const userMessage = request.context
    ? `Research the following for a ${request.context} case:\n\n${request.topic}`
    : `Research the following:\n\n${request.topic}`

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16384,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: userMessage }],
  })

  const textBlocks = response.content.filter((b: any) => b.type === "text")
  let fullText = textBlocks.map((b: any) => b.text).join("\n\n")

  // Strip preamble — remove any "I'll research...", "Let me search..." lines before the actual memo
  fullText = stripPreamble(fullText)

  const sources = extractSourcesFromResponse(response)
  const summary = extractSummaryFromText(fullText)

  // Run through reasoning pipeline for quality evaluation
  try {
    const { evaluateAIOutput } = await import("@/lib/reasoning/wrap")
    const evaluated = await evaluateAIOutput({
      draft: fullText,
      taskType: "general",
      originalRequest: request.topic,
      sourceContext: `Research topic: ${request.topic}. Scope: ${request.scope || "standard"}.`,
      model: "claude-opus-4-6",
    })
    if (evaluated.pipelineDecision !== "skipped") {
      fullText = evaluated.output
      console.log(`[Reasoning] Web research: ${evaluated.pipelineDecision} (score=${evaluated.pipelineScore})`)
    }
  } catch (e: any) {
    console.warn("[Reasoning] Web research pipeline error (non-blocking):", e.message)
  }

  fullText = humanizeText(fullText)

  const result: ResearchResult = { summary, sources, fullText }

  if (request.saveToKB) {
    const scrubbed = scrubForKnowledgeBase(fullText, "", "")
    const title = `Research: ${request.topic.substring(0, 100)}`

    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        description: `Web research conducted ${new Date().toISOString()}. Topic: ${request.topic}`,
        category: (VALID_KB_CATEGORIES.includes(request.kbCategory as KnowledgeCategory) ? request.kbCategory : "CUSTOM") as KnowledgeCategory,
        sourceText: scrubbed,
        sourceType: "WEB_RESEARCH",
        tags: [...(request.kbTags || []), "web-research", "auto-generated"],
        uploadedById: request.userId || "system",
        processingStatus: "ready",
      },
    })

    // Chunk and embed if ingest function is available
    try {
      const { ingestDocument } = await import("@/lib/knowledge/ingest")
      await ingestDocument(doc.id, scrubbed)
    } catch (e: any) {
      console.warn("[Research] KB ingestion failed (non-blocking):", e.message)
    }

    result.savedToKB = { documentId: doc.id, title }
  }

  return result
}

function extractSourcesFromResponse(response: any): Array<{ title: string; url: string; snippet: string }> {
  const sources: Array<{ title: string; url: string; snippet: string }> = []
  try {
    for (const block of response.content) {
      if (block.type === "web_search_tool_result" || block.type === "tool_result") {
        const results = block.content || block.search_results || []
        for (const r of Array.isArray(results) ? results : []) {
          if (r.url) {
            sources.push({
              title: r.title || r.url,
              url: r.url,
              snippet: (r.snippet || r.text || "").substring(0, 200),
            })
          }
        }
      }
    }
  } catch { /* non-fatal */ }
  return sources
}

function extractSummaryFromText(text: string): string {
  // Try ## Summary heading first (new format)
  const h2Match = text.match(/##\s*Summary\s*\n+([\s\S]*?)(?:\n##|\n---)/i)
  if (h2Match) return h2Match[1].trim().substring(0, 500)

  // Fall back to numbered format
  const summaryMatch = text.match(/(?:SUMMARY|Summary)[:\s]*\n?([\s\S]*?)(?:\n\n|\n\d\.|\nCURRENT)/i)
  if (summaryMatch) return summaryMatch[1].trim().substring(0, 500)
  return text.substring(0, 300).trim()
}

/**
 * Strip Claude's self-narration preamble from the output.
 * Removes lines like "I'll research this...", "Let me search...",
 * "I now have comprehensive research..." that appear before the actual memo.
 */
function stripPreamble(text: string): string {
  const lines = text.split("\n")
  let startIdx = 0

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim()
    // Skip empty lines at the top
    if (!line) { startIdx = i + 1; continue }
    // Skip common preamble patterns
    if (
      line.match(/^I'll |^I will |^Let me |^I now have |^I've found |^Now let me |^Let's |^I need to |^First,? let me |^I should |^Here are |^Based on /i) ||
      line.match(/^I('ll| will) (research|search|look|find|analyze|compile|investigate|examine)/i) ||
      line.match(/^(Searching|Looking|Analyzing|Compiling|Researching)/i)
    ) {
      startIdx = i + 1
      continue
    }
    // Found real content — stop stripping
    break
  }

  // Also strip leading "---" separators after preamble
  while (startIdx < lines.length && (lines[startIdx].trim() === "---" || lines[startIdx].trim() === "")) {
    startIdx++
  }

  return lines.slice(startIdx).join("\n").trim()
}
