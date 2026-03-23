import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

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

OUTPUT FORMAT:
Provide your findings as a structured research memo:
1. SUMMARY (2-3 sentences of the key finding)
2. CURRENT GUIDANCE (the authoritative answer with full citations)
3. RECENT CHANGES (any updates in the last 12 months, if applicable)
4. SOURCES (list of URLs and documents consulted)
5. PRACTITIONER NOTES (any caveats, open questions, or areas of uncertainty)

If the topic is ${request.scope === "narrow" ? "specific — answer it directly" : "broad — survey the landscape and identify key authorities"}.`

  const userMessage = request.context
    ? `Research the following for a ${request.context} case:\n\n${request.topic}`
    : `Research the following:\n\n${request.topic}`

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: userMessage }],
  })

  const textBlocks = response.content.filter((b: any) => b.type === "text")
  const fullText = textBlocks.map((b: any) => b.text).join("\n\n")

  const sources = extractSourcesFromResponse(response)
  const summary = extractSummaryFromText(fullText)

  const result: ResearchResult = { summary, sources, fullText }

  if (request.saveToKB) {
    const scrubbed = scrubForKnowledgeBase(fullText, "", "")
    const title = `Research: ${request.topic.substring(0, 100)}`

    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        description: `Web research conducted ${new Date().toISOString()}. Topic: ${request.topic}`,
        category: (request.kbCategory || "CUSTOM") as any,
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
  const summaryMatch = text.match(/(?:SUMMARY|Summary)[:\s]*\n?([\s\S]*?)(?:\n\n|\n\d\.|\nCURRENT)/i)
  if (summaryMatch) return summaryMatch[1].trim().substring(0, 500)
  return text.substring(0, 300).trim()
}
