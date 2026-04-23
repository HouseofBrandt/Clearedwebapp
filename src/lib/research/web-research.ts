import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"
import { humanizeText } from "@/lib/ai/humanizer"
import {
  VERIFY_CITATION_TOOL,
  verifyCitation,
  type VerificationResult,
} from "./citation-verifier"
import { scanCitations } from "./citation-normalizer"
import { buildMessagesRequest } from "@/lib/ai/model-capabilities"
import { preferredOpusModel } from "@/lib/ai/model-selection"
import { RESEARCH_RESPONSE_STYLE_SUFFIX } from "./memo-system-prompt"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

const VALID_KB_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const
type KnowledgeCategory = typeof VALID_KB_CATEGORIES[number]

/**
 * Per-event progress emitted during conductResearch. The launch route
 * forwards these to the client over SSE so the UI can show specific,
 * moment-to-moment status instead of a vague "Composing..." for 60s.
 *
 * Keep the payload small and stable — event schema leaks into the SSE
 * transport.
 */
export type ResearchProgressEvent =
  | { kind: "phase"; phase: "preparing" | "searching" | "verifying" | "composing" | "backfill" | "evaluating" | "humanizing" | "ingesting" | "complete"; message: string }
  | { kind: "verify_citation"; citation: string; status: "started" | "verified" | "not_found" | "superseded" | "unverifiable" }
  | { kind: "source_found"; total: number }
  | { kind: "detail"; message: string }

export interface ResearchRequest {
  topic: string
  context?: string
  scope: "narrow" | "broad"
  saveToKB?: boolean
  kbCategory?: string
  kbTags?: string[]
  userId?: string
  /**
   * Optional progress listener. The caller (typically the launch route)
   * forwards these events to an SSE stream. Never throws — callers
   * should make this cheap and side-effect-free.
   */
  onProgress?: (event: ResearchProgressEvent) => void
}

export interface ResearchResult {
  summary: string
  sources: Array<{ title: string; url: string; snippet: string }>
  /** Citations the model emitted, each labeled with verify_citation's
   *  verdict so the API route / UI can flag unverified authorities to the
   *  practitioner before the memo ships. */
  citations: Array<VerificationResult>
  fullText: string
  savedToKB?: { documentId: string; title: string }
}

export async function conductResearch(request: ResearchRequest): Promise<ResearchResult> {
  const systemPrompt = `You are a tax law researcher for a licensed tax resolution firm. Your job is to find the most current, authoritative information on the given topic and produce a memo the firm's attorneys can rely on.

You have TWO tools:

  - web_search: Open search for primary-source URLs (IRS.gov, law.cornell.edu, ustaxcourt.gov).
  - verify_citation: A structured verifier that checks any legal citation against the firm's own authority database and CourtListener. Returns canonical case name, year, court, source URL, and supersession status.

CITATION GROUNDING — LOAD-BEARING RULE:

  Before stating what a case held, or the substance of any Treas. Reg., IRC
  section, IRM section, Rev. Rul., Rev. Proc., Notice, or PLR, you MUST call
  verify_citation on that authority. Then:

  • If verify_citation returns status="verified", you may describe the
    authority using the returned title + court + summary. If you want to
    add detail beyond what the tool returned, confirm via web_search first.

  • If verify_citation returns status="superseded", note the supersession
    in your memo and, if possible, cite the replacement authority instead.

  • If verify_citation returns status="not_found" OR status="unverifiable",
    you may NOT describe a holding from memory. Either (a) drop the citation
    entirely, or (b) include it with the explicit prefix "[UNVERIFIED —
    confirm before relying]" and do NOT describe its substance.

  Describing a case's holding from your training data alone — without
  calling verify_citation first — is a safety failure. The model's job is
  to say what the AUTHORITY says, not what the model remembers.

  Example of CORRECT abstention when a citation can't be verified:
    > "This position may be supported by Tax Court precedent in this area,
    >  but I was unable to confirm the specific holdings of the cases I
    >  recalled. I recommend a Westlaw check on Tax Court opinions applying
    >  § 1402(a)(13) to LLPs before relying on this analysis."

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

If the topic is ${request.scope === "narrow" ? "specific — answer it directly and concisely" : "broad — survey the landscape and identify key authorities"}.

${RESEARCH_RESPONSE_STYLE_SUFFIX}`

  const userMessage = request.context
    ? `Research the following for a ${request.context} case:\n\n${request.topic}`
    : `Research the following:\n\n${request.topic}`

  const emit = (event: ResearchProgressEvent) => {
    try { request.onProgress?.(event) } catch { /* never let UI hooks fail the research */ }
  }

  emit({ kind: "phase", phase: "preparing", message: "Preparing research context" })

  // Agentic multi-turn loop: Claude produces text and may emit tool_use
  // blocks (web_search is built-in; verify_citation is our handler). Each
  // tool_use gets a corresponding tool_result appended to the messages,
  // and we continue the loop until stop_reason !== "tool_use". Capped at
  // MAX_TOOL_TURNS to bound cost in the pathological case.
  const MAX_TOOL_TURNS = 8

  const messages: any[] = [{ role: "user", content: userMessage }]

  // Citations accumulated across turns — every verify_citation call gets
  // recorded here so the route + UI can show verification status per-cite
  // without re-running verifiers on the final memo.
  const citationsCollected: VerificationResult[] = []

  const researchModel = preferredOpusModel()
  // Scale effort: narrow-scope (QUICK_ANSWER) questions don't need xhigh
  // reasoning and it just doubles the latency for marginal quality gain.
  // Broad-scope questions get "high" — which is still aggressive on 4.7.
  const researchEffort: "medium" | "high" = request.scope === "narrow" ? "medium" : "high"
  // Per-call Anthropic timeout. Without this, a hung upstream call stalls
  // the entire research until the Vercel function timeout kills it. 4 min
  // per call × up to 8 turns + evaluator fits inside our 800s envelope.
  const ANTHROPIC_CALL_TIMEOUT_MS = 240_000
  let response: any
  let turns = 0
  emit({ kind: "phase", phase: "searching", message: "Searching for authorities" })
  while (true) {
    response = await anthropic.messages.create(
      buildMessagesRequest({
        model: researchModel,
        max_tokens: 16384,
        system: systemPrompt,
        tools: [
          { type: "web_search_20250305", name: "web_search" },
          VERIFY_CITATION_TOOL,
        ],
        messages,
        effort: researchEffort,
      }),
      { timeout: ANTHROPIC_CALL_TIMEOUT_MS }
    )

    // Append the assistant turn to the conversation.
    messages.push({ role: "assistant", content: response.content })

    // Forward any web_search results to the progress stream so the UI can
    // narrate which sources landed. Anthropic's built-in web_search tool
    // includes results inline in the assistant content.
    const webSearchBlocks = response.content.filter(
      (b: any) => b.type === "web_search_tool_result" || b.type === "tool_result"
    )
    let sourceCount = 0
    for (const block of webSearchBlocks) {
      const results = block.content || block.search_results || []
      if (Array.isArray(results)) sourceCount += results.length
    }
    if (sourceCount > 0) emit({ kind: "source_found", total: sourceCount })

    // If the model stopped for any reason other than tool_use, we're done.
    if (response.stop_reason !== "tool_use") break

    // Collect every tool_use block. Only verify_citation requires our
    // handler; web_search is a server-side built-in that Anthropic
    // executes and includes the result in the next response automatically,
    // so we don't need to respond to it here.
    const toolUses = response.content.filter(
      (b: any) => b.type === "tool_use" && b.name === VERIFY_CITATION_TOOL.name
    )

    if (toolUses.length === 0) {
      // stop_reason=tool_use but only web_search was called — Anthropic
      // handles that one server-side; on the next turn the results are
      // already in the assistant message. Just continue the loop to let
      // Claude produce its next turn.
      emit({ kind: "detail", message: "Reading web-search results" })
      if (++turns >= MAX_TOOL_TURNS) break
      continue
    }

    emit({ kind: "phase", phase: "verifying", message: `Verifying ${toolUses.length} citation${toolUses.length === 1 ? "" : "s"}` })

    // Resolve each verify_citation call in parallel. One call per tool_use —
    // the same VerificationResult feeds both the accumulator and the
    // tool_result payload sent back to Claude.
    const results = await Promise.all(
      toolUses.map(async (tu: any) => {
        const input = tu.input as { citation: string }
        emit({ kind: "verify_citation", citation: input.citation, status: "started" })
        const v = await verifyCitation(input.citation)
        citationsCollected.push(v)
        emit({ kind: "verify_citation", citation: input.citation, status: v.status })
        const payload = {
          citation: v.raw,
          status: v.status,
          verified_title: v.verifiedTitle,
          court_or_agency: v.courtOrAgency,
          year: v.year,
          summary: v.summary,
          source_url: v.sourceUrl,
          superseded_by: v.supersededBy,
          note: v.note,
          source_of_truth: v.sourceOfTruth,
        }
        return { tool_use_id: tu.id, payload }
      })
    )

    // Append a single user message containing all tool_result blocks.
    messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.tool_use_id,
        content: JSON.stringify(r.payload),
      })),
    })

    if (++turns >= MAX_TOOL_TURNS) {
      console.warn(
        `[conductResearch] Reached MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) — stopping loop.`
      )
      break
    }
  }

  emit({ kind: "phase", phase: "composing", message: "Composing the memo" })

  const textBlocks = response.content.filter((b: any) => b.type === "text")
  let fullText = textBlocks.map((b: any) => b.text).join("\n\n")

  // Strip preamble — remove any "I'll research...", "Let me search..." lines before the actual memo
  fullText = stripPreamble(fullText)

  const sources = extractSourcesFromResponse(response)
  const summary = extractSummaryFromText(fullText)

  // Post-pass: if the memo contains a citation the model never actually
  // verified (lazy model behavior), verify now and record the result. This
  // backstops the system-prompt rule.
  emit({ kind: "phase", phase: "backfill", message: "Double-checking citations in the draft" })
  await backfillUnverifiedCitations(fullText, citationsCollected)

  // Run through reasoning pipeline for quality evaluation
  emit({ kind: "phase", phase: "evaluating", message: "Evaluating draft quality" })
  try {
    const { evaluateAIOutput } = await import("@/lib/reasoning/wrap")
    const evaluated = await evaluateAIOutput({
      draft: fullText,
      taskType: "general",
      originalRequest: request.topic,
      sourceContext: `Research topic: ${request.topic}. Scope: ${request.scope || "standard"}.`,
      model: researchModel,
    })
    if (evaluated.pipelineDecision !== "skipped") {
      fullText = evaluated.output
      console.log(`[Reasoning] Web research: ${evaluated.pipelineDecision} (score=${evaluated.pipelineScore})`)
    }
  } catch (e: any) {
    console.warn("[Reasoning] Web research pipeline error (non-blocking):", e.message)
  }

  emit({ kind: "phase", phase: "humanizing", message: "Polishing language" })
  fullText = humanizeText(fullText)

  const result: ResearchResult = {
    summary,
    sources,
    citations: citationsCollected,
    fullText,
  }

  if (request.saveToKB) {
    emit({ kind: "phase", phase: "ingesting", message: "Saving to the firm's knowledge base" })
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

  emit({ kind: "phase", phase: "complete", message: "Research complete" })
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

/**
 * Safety-net pass after the agentic loop completes. Scans the composed
 * memo for citation shapes, and for any citation the model wrote without
 * calling verify_citation, runs verification now and appends the result
 * to the accumulator.
 *
 * This catches the lazy-model failure mode: the system prompt says "you
 * MUST call verify_citation", but a model under pressure sometimes just
 * writes the citation and keeps going. The backfill ensures the route's
 * `isVerified` flags reflect reality for every cite that appears in the
 * final text, not just the ones the model explicitly verified.
 *
 * Dedupes against `already.raw` AND `already` normalized keys so we don't
 * double-count a cite the model verified AND also wrote in the memo.
 */
async function backfillUnverifiedCitations(
  fullText: string,
  already: VerificationResult[]
): Promise<void> {
  const hits = scanCitations(fullText)
  if (hits.length === 0) return

  // Build a dedup key set from what's already been verified.
  const seenKeys = new Set<string>()
  for (const v of already) {
    seenKeys.add(v.raw.trim())
    // Attempt to derive a normalized key for cross-check. Cheap re-parse.
    try {
      const reparsed = scanCitations(v.raw)
      for (const r of reparsed) seenKeys.add(r.normalized)
    } catch { /* non-fatal */ }
  }

  const missing = hits.filter((h) => !seenKeys.has(h.raw.trim()) && !seenKeys.has(h.normalized))
  if (missing.length === 0) return

  // Cap the backfill to keep unexpected input from blowing the budget.
  const CAP = 20
  const toVerify = missing.slice(0, CAP)
  if (missing.length > CAP) {
    console.warn(
      `[conductResearch] backfill found ${missing.length} un-verified citations, capping at ${CAP}`
    )
  }

  const results = await Promise.all(toVerify.map((m) => verifyCitation(m.raw)))
  for (const r of results) already.push(r)
}
