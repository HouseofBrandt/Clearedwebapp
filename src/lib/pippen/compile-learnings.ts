/**
 * Stage 2: Compile Daily Learnings Report
 *
 * Queries today's SourceArtifact records, sends them to Claude for
 * practitioner-friendly summarization, and returns a CompiledReport.
 */

import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { humanizeText } from "@/lib/ai/humanizer"
import { decodeRawContent } from "@/lib/tax-authority/integration/promote-artifacts"

// Per-artifact body excerpt cap. Claude needs enough of each document to
// summarize, but the total prompt has to fit. With 50+ artifacts/day this
// caps the prompt at ~150KB even at the upper bound.
const ARTIFACT_BODY_CHAR_CAP = 3000

// Floor for asking Claude at all. Below this absolute count OR below 50% of
// the day's artifacts having decodable bodies, we emit the deterministic
// template instead. The 50% rule is what catches the May 4 brief — we had
// many artifacts but most were PDFs decodeRawContent rejects, leaving Claude
// with too few to work with so it wrote a meta-refusal that got published.
const MIN_DECODABLE_FOR_AI_SUMMARY = 5
const MIN_DECODABLE_RATIO_FOR_AI_SUMMARY = 0.5

export interface DailyLearning {
  title: string
  summary: string
  source: string
  sourceUrl: string
  relevance: string
  actionItems?: string[]
  publicationDate?: string
  /**
   * Primary issue category extracted from the harvester's classifyIssue() pass
   * (Pippen Phase 2 — see base-harvester.ts). Used by the practitioner
   * feedback control to call /api/tax-authority/preference with a
   * (sourceId, issueCategory) pair. Defaults to "general" when no category
   * survived classification (legacy pre-Phase-2 artifacts, mostly).
   */
  issueCategory?: string
}

/**
 * Pull the first non-"mixed" issue category from SourceArtifact.metadata if
 * Phase 2 classifyIssue() ran on this artifact. Falls back to "general" so
 * the preference API still has a category to bucket the signal into.
 */
function extractIssueCategory(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "general"
  const m = metadata as Record<string, unknown>
  const cats = m.issueCategories
  if (Array.isArray(cats)) {
    const first = cats.find((c) => typeof c === "string" && c !== "mixed")
    if (first) return String(first)
  }
  return "general"
}

export interface CompiledReport {
  date: string
  title: string
  learnings: DailyLearning[]
  topTakeaway: string
  markdownContent: string
}

/**
 * Decide whether Claude's parsed JSON looks like a meta-refusal that
 * shouldn't be published. Exported separately so we can test it against
 * the real failure-mode strings we've seen in production briefs without
 * spinning up Prisma + the LLM.
 *
 * Returns refused=true when ANY of:
 *   - topTakeaway hits one of our high-signal singletons
 *   - topTakeaway matches 2+ of the broader pipeline-vocabulary terms
 *   - learnings array is empty
 *   - learnings count is < 40% of decodableCount (Claude got context but
 *     skipped most of it — likely refusal-flavoured output)
 */
export function looksLikeFailureRefusal(
  parsed: { learnings?: Array<unknown> | null; topTakeaway?: string | null },
  decodableCount: number,
): {
  refused: boolean
  reason: "fast-path" | "term-co-occurrence" | "empty-learnings" | "refused-most" | null
  matchedTerms: string[]
  learningsCount: number
  takeawayPreview: string
} {
  // High-signal singletons — these only appear in pipeline-meta refusals,
  // never in real tax-authority takeaways. Any single match → bail.
  const FAST_PATH = [
    "no summaries can be",
    "no summaries to provide",
    "no summaries to share",
    "metadata only",
    "re-run with full",
    "retrieval failure",
    "fetch pipeline",
  ]

  // Broader vocabulary — any 2 co-occurring → bail.
  const PIPELINE_TERMS = [
    "fetch pipeline", "retrieval failure", "retrieval pipeline",
    "metadata only", "metadata-only", "no document content",
    "no body text", "no content was provided", "without body text",
    "without content", "without document content",
    "could not be summarized", "cannot be summarized", "unable to summarize",
    "responsibly generated", "responsibly summari", // covers "summarize"/"summarized"
    "must be re-fetched", "should be re-fetched", "re-run with",
    "re-run the", "rerun the fetch", "full text retrieval",
    "full-text retrieval", "full text extraction", "full-text extraction",
    "delivered without", "practitioner-facing summari",
    "no summaries can", "summaries cannot", "no summaries to",
    "pipeline error", "ingestion error", "before requesting",
  ]

  const lowerTakeaway = (parsed.topTakeaway ?? "").toLowerCase()
  const learningsCount = parsed.learnings?.length ?? 0
  const takeawayPreview = lowerTakeaway.slice(0, 200)

  if (FAST_PATH.some((p) => lowerTakeaway.includes(p))) {
    return { refused: true, reason: "fast-path", matchedTerms: FAST_PATH.filter((p) => lowerTakeaway.includes(p)), learningsCount, takeawayPreview }
  }

  const matched = PIPELINE_TERMS.filter((p) => lowerTakeaway.includes(p))
  if (matched.length >= 2) {
    return { refused: true, reason: "term-co-occurrence", matchedTerms: matched, learningsCount, takeawayPreview }
  }

  if (learningsCount === 0) {
    return { refused: true, reason: "empty-learnings", matchedTerms: matched, learningsCount, takeawayPreview }
  }

  if (decodableCount > 0 && learningsCount < Math.max(2, Math.floor(decodableCount * 0.4))) {
    return { refused: true, reason: "refused-most", matchedTerms: matched, learningsCount, takeawayPreview }
  }

  return { refused: false, reason: null, matchedTerms: matched, learningsCount, takeawayPreview }
}

/**
 * Build a template-based report when Claude is unavailable or unsuitable
 * (too few decodable bodies, refusal output, parse error, etc.).
 *
 * Groups artifacts by source so the practitioner sees "12 new IRMs, 3
 * Tax Court opinions, 2 Rev. Procs" — meaningful at a glance — instead
 * of an unstructured list. Source label is humanized.
 */
function buildFallbackReport(
  dateStr: string,
  artifacts: Array<{ normalizedTitle: string; sourceUrl: string; publicationDate: Date | null; sourceId: string }>,
): CompiledReport {
  const learnings: DailyLearning[] = artifacts.map((a) => ({
    title: a.normalizedTitle,
    summary: `New ${humanizeSourceId(a.sourceId)} published${a.publicationDate ? ` ${a.publicationDate.toISOString().split("T")[0]}` : ""}.`,
    source: a.sourceId,
    sourceUrl: a.sourceUrl,
    relevance: relevanceForSource(a.sourceId),
    publicationDate: a.publicationDate?.toISOString().split("T")[0],
    issueCategory: extractIssueCategory((a as any).metadata),
  }))

  // Group counts by source for the headline.
  const counts: Record<string, number> = {}
  for (const a of artifacts) {
    const label = humanizeSourceId(a.sourceId)
    counts[label] = (counts[label] ?? 0) + 1
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`)
    .join(", ")

  const headline = artifacts.length > 0
    ? `${artifacts.length} new tax authority material${artifacts.length === 1 ? "" : "s"} today — ${breakdown}.`
    : "No new materials today."

  const lines = [
    `# Pippen Daily Learnings — ${dateStr}`,
    "",
    `> ${headline}`,
    "",
  ]

  for (const l of learnings) {
    lines.push(`## ${l.title}`)
    lines.push("")
    lines.push(`- **Source:** [${l.source}](${l.sourceUrl})`)
    lines.push(`- **Note:** ${l.summary}`)
    lines.push(`- **Relevance:** ${l.relevance}`)
    if (l.publicationDate) {
      lines.push(`- **Published:** ${l.publicationDate}`)
    }
    lines.push("")
  }

  return {
    date: dateStr,
    title: `Pippen Daily Learnings — ${dateStr}`,
    learnings,
    topTakeaway: headline,
    markdownContent: lines.join("\n"),
  }
}

/**
 * Map our internal sourceId values to practitioner-readable labels.
 * Falls back to the raw id when unrecognized.
 */
function humanizeSourceId(sourceId: string): string {
  const map: Record<string, string> = {
    irs_irm: "IRM section",
    treas_reg_cfr26: "Treasury Regulation",
    ustc_opinions: "Tax Court opinion",
    irs_irb: "IRB / Rev. Proc / Rev. Rul",
    irs_written_determinations: "IRS written determination",
    irs_news_releases: "IRS news release",
    treasury_press: "Treasury press release",
    taxpayer_advocate: "TAS report",
    irs_forms_pubs: "IRS form/publication update",
  }
  return map[sourceId] ?? sourceId.replace(/_/g, " ")
}

function relevanceForSource(sourceId: string): string {
  switch (sourceId) {
    case "irs_irm":
      return "Internal Revenue Manual — procedural guidance binding on IRS staff. Check for revisions to sections you cite."
    case "treas_reg_cfr26":
      return "Treasury Regulation — high authority. Review if it touches an active resolution path."
    case "ustc_opinions":
      return "Tax Court opinion — precedential or persuasive. Scan for applicability to current cases."
    case "irs_irb":
      return "Internal Revenue Bulletin item (Rev. Proc, Rev. Rul, Notice). Often actionable for ongoing matters."
    default:
      return "Review to determine applicability to active cases."
  }
}

/**
 * Compile the daily learnings report for the given date.
 */
export async function compileDailyLearnings(date?: Date): Promise<CompiledReport> {
  const reportDate = date ?? new Date()
  const startOfDay = new Date(reportDate)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(reportDate)
  endOfDay.setUTCHours(23, 59, 59, 999)
  const dateStr = startOfDay.toISOString().split("T")[0]

  // Query today's SourceArtifact records
  let artifacts: Array<{
    id: string
    normalizedTitle: string
    sourceUrl: string
    publicationDate: Date | null
    sourceId: string
    contentType: string
    metadata: any
    rawContent: Buffer | Uint8Array | null
  }> = []

  try {
    artifacts = await prisma.sourceArtifact.findMany({
      where: {
        fetchedAt: { gte: startOfDay, lte: endOfDay },
        // Only consider artifacts the harvester kept (matched practitioner
        // relevance). Skip off-topic / preference-suppressed rows so Claude
        // doesn't waste tokens on noise. PENDING = kept, awaiting promotion;
        // COMPLETE = already promoted to KB.
        parserStatus: { in: ["PENDING", "COMPLETE"] },
      },
      select: {
        id: true,
        normalizedTitle: true,
        sourceUrl: true,
        publicationDate: true,
        sourceId: true,
        contentType: true,
        metadata: true,
        rawContent: true,
      },
      orderBy: { fetchedAt: "desc" },
    })
  } catch (err) {
    console.error("[Pippen] Failed to query SourceArtifact:", err)
    // Table may not exist — return empty report
    return {
      date: dateStr,
      title: `Pippen Daily Learnings — ${dateStr}`,
      learnings: [],
      topTakeaway: "No new materials today.",
      markdownContent: `# Pippen Daily Learnings — ${dateStr}\n\nNo new materials today.`,
    }
  }

  if (artifacts.length === 0) {
    return {
      date: dateStr,
      title: `Pippen Daily Learnings — ${dateStr}`,
      learnings: [],
      topTakeaway: "No new materials today.",
      markdownContent: `# Pippen Daily Learnings — ${dateStr}\n\nNo new materials today.`,
    }
  }

  // Decode body text for each artifact. PDFs and binary blobs return null;
  // those flow through the AI pipeline as title-only entries (Claude is
  // explicitly told to skip them). The decoded-count gates whether we even
  // call Claude — if too few have real text, the template report is more
  // honest than asking the model to summarize air.
  const decoded = artifacts.map((a) => {
    const body =
      a.rawContent
        ? decodeRawContent(a.rawContent as unknown as Buffer, a.contentType)
        : null
    return { artifact: a, body: body ? body.trim() : null }
  })
  const decodableCount = decoded.filter((d) => d.body && d.body.length > 100).length

  const decodableRatio = decodableCount / Math.max(1, artifacts.length)
  if (
    decodableCount < MIN_DECODABLE_FOR_AI_SUMMARY ||
    decodableRatio < MIN_DECODABLE_RATIO_FOR_AI_SUMMARY
  ) {
    // Either too few absolute, or the ratio is so skewed Claude will spend
    // its tokens writing about what's missing instead of summarizing what's
    // there. The template fallback lists every artifact honestly with title
    // + source, which beats "we cannot responsibly summarize today" by miles.
    console.warn(
      `[Pippen] Only ${decodableCount} of ${artifacts.length} artifacts decoded to body text (ratio ${decodableRatio.toFixed(2)}) — falling back to template.`
    )
    return buildFallbackReport(dateStr, artifacts)
  }

  // Build input for Claude — title + metadata + body excerpt (or a clear
  // "[no body text — title-only]" marker so the model doesn't invent content).
  const artifactSummaries = decoded.map((d, i) => {
    const a = d.artifact
    const pubDate = a.publicationDate?.toISOString().split("T")[0] ?? "unknown"
    const head = `[${i + 1}] Title: ${a.normalizedTitle}\n    Source: ${a.sourceId}\n    URL: ${a.sourceUrl}\n    Published: ${pubDate}\n    Type: ${a.contentType}`
    if (!d.body || d.body.length < 100) {
      return `${head}\n    Body: [unavailable — title-only metadata; do not summarize, just note the title]`
    }
    const truncated =
      d.body.length > ARTIFACT_BODY_CHAR_CAP
        ? d.body.slice(0, ARTIFACT_BODY_CHAR_CAP) + "\n[…truncated…]"
        : d.body
    return `${head}\n    Body:\n${truncated}`
  }).join("\n\n")

  const systemPrompt = `You are Pippen, an AI research assistant for a tax resolution firm. Your job is to summarize newly fetched tax authority materials into practitioner-friendly learning items.

ABSOLUTE RULE — DO NOT WRITE META-COMMENTARY ABOUT THE PIPELINE.
If you ever find yourself drafting any of the following, STOP and rewrite without it:
- "No summaries can be generated"
- "the fetch pipeline ..."
- "metadata only" / "no document content" / "no body text"
- "re-run with full text" / "re-fetched" / "must be re-fetched"
- "responsibly generated" / "responsibly summarized"
- "practitioner-facing summaries" (as a meta-noun)
- "retrieval failure" / "ingestion error"
- Any sentence whose subject is the data pipeline, fetch process, or
  availability of body text.

Your audience is a tax practitioner reading the daily newsfeed. They do
NOT want to know about pipeline issues — they want substantive summaries
of what was published in the IRC, IRM, Treas. Regs, Tax Court, etc.

Handling entries with no Body:
- Silently omit them from the learnings array. Do not mention them.
- If FEWER THAN HALF the entries have a Body, still summarize the ones
  that do. Do not attempt to characterize the day's content as a whole;
  just summarize what's actually in front of you.
- If literally zero entries have a Body, return an empty learnings array
  and a topTakeaway that is a single neutral sentence about the count of
  new materials (e.g. "47 new IRS publications fetched today; awaiting
  body extraction for substantive summaries"). DO NOT use the words
  "pipeline", "retrieval", "re-run", "responsibly", or any of the banned
  phrases above.

For each source material provided, you must:
1. Write a clear, concise summary (2-3 sentences)
2. Explain why it matters for tax resolution practitioners (1-2 sentences)
3. List any action items or deadlines practitioners should note
4. Pick the single most important item as the "top takeaway" for the firm newsfeed

Organize the learnings by priority tier:

**Tier 1 — Core Practice (most important):**
Topics: OIC (IRC § 7122), Penalty Administration (IRC § 6651/6654), IRS Liens & Levies (IRC § 6321-6343), CDP (IRC § 6320/6330), Installment Agreements (IRC § 6159), CNC, TFRP (IRC § 6672), Innocent Spouse (IRC § 6015), CSED (IRC § 6502), legal drafting guidance

**Tier 2 — Adjacent Practice:**
Topics: Audit & Exam procedures, Appeals processes, Tax Court litigation, Circular 230

**Tier 3 — General (supplemental):**
Topics: General tax policy, state tax, legislative proposals

Lead with Tier 1 items. If volume is high, truncate Tier 3 to a single summary line.

Respond in valid JSON with this exact structure:
{
  "learnings": [
    {
      "index": 1,
      "title": "...",
      "summary": "...",
      "relevance": "...",
      "actionItems": ["..."],
      "tier": 1
    }
  ],
  "topTakeaway": "A single sentence describing the most important item for practitioners today."
}

Be concise and practical. Focus on what practitioners need to know and do.`

  const userMessage = `Here are ${artifacts.length} new source materials fetched today (${dateStr}). Summarize each for our tax resolution practitioners:\n\n${artifactSummaries}`

  try {
    const response = await callClaude({
      systemPrompt,
      userMessage,
      model: "claude-sonnet-4-6",
      temperature: 0.3,
      maxTokens: 4096,
    })

    // Parse the JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[Pippen] Claude response not valid JSON, falling back to template")
      return buildFallbackReport(dateStr, artifacts)
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      learnings: Array<{
        index: number
        title: string
        summary: string
        relevance: string
        actionItems?: string[]
      }>
      topTakeaway: string
    }

    // Guardrail: detect when Claude returned a meta-error response instead
    // of summaries.
    const verdict = looksLikeFailureRefusal(parsed, decodableCount)
    if (verdict.refused) {
      console.warn("[Pippen] Claude response looks like a failure report — falling back to template", {
        ...verdict,
        decodableCount,
        artifactsCount: artifacts.length,
      })
      return buildFallbackReport(dateStr, artifacts)
    }

    // Map Claude's output back to artifacts
    const learnings: DailyLearning[] = parsed.learnings.map((l) => {
      const artifact = artifacts[(l.index ?? 1) - 1] ?? artifacts[0]
      return {
        title: l.title || artifact.normalizedTitle,
        summary: l.summary,
        source: artifact.sourceId,
        sourceUrl: artifact.sourceUrl,
        relevance: l.relevance,
        actionItems: l.actionItems,
        publicationDate: artifact.publicationDate?.toISOString().split("T")[0],
        issueCategory: extractIssueCategory(artifact.metadata),
      }
    })

    // Build markdown content
    const mdLines = [
      `# Pippen Daily Learnings — ${dateStr}`,
      "",
      `> **Top Takeaway:** ${parsed.topTakeaway}`,
      "",
      `---`,
      "",
    ]

    for (const l of learnings) {
      mdLines.push(`## ${l.title}`)
      mdLines.push("")
      mdLines.push(l.summary)
      mdLines.push("")
      mdLines.push(`**Why it matters:** ${l.relevance}`)
      mdLines.push("")
      if (l.actionItems && l.actionItems.length > 0) {
        mdLines.push("**Action items:**")
        for (const item of l.actionItems) {
          mdLines.push(`- ${item}`)
        }
        mdLines.push("")
      }
      mdLines.push(`*Source: [${l.source}](${l.sourceUrl})*`)
      if (l.publicationDate) {
        mdLines.push(`*Published: ${l.publicationDate}*`)
      }
      mdLines.push("")
      mdLines.push("---")
      mdLines.push("")
    }

    return {
      date: dateStr,
      title: `Pippen Daily Learnings — ${dateStr}`,
      learnings,
      topTakeaway: humanizeText(parsed.topTakeaway),
      markdownContent: humanizeText(mdLines.join("\n")),
    }
  } catch (err) {
    console.error("[Pippen] Claude call failed, falling back to template:", err)
    return buildFallbackReport(dateStr, artifacts)
  }
}
