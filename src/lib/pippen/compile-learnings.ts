/**
 * Stage 2: Compile Daily Learnings Report
 *
 * Queries today's SourceArtifact records, sends them to Claude for
 * practitioner-friendly summarization, and returns a CompiledReport.
 */

import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"

export interface DailyLearning {
  title: string
  summary: string
  source: string
  sourceUrl: string
  relevance: string
  actionItems?: string[]
  publicationDate?: string
}

export interface CompiledReport {
  date: string
  title: string
  learnings: DailyLearning[]
  topTakeaway: string
  markdownContent: string
}

/**
 * Build a simple template-based report when Claude is unavailable.
 */
function buildFallbackReport(
  dateStr: string,
  artifacts: Array<{ normalizedTitle: string; sourceUrl: string; publicationDate: Date | null; sourceId: string }>,
): CompiledReport {
  const learnings: DailyLearning[] = artifacts.map((a) => ({
    title: a.normalizedTitle,
    summary: `New material fetched from ${a.sourceId}.`,
    source: a.sourceId,
    sourceUrl: a.sourceUrl,
    relevance: "Review to determine applicability to active cases.",
    publicationDate: a.publicationDate?.toISOString().split("T")[0],
  }))

  const lines = [
    `# Pippen Daily Learnings — ${dateStr}`,
    "",
    `> ${artifacts.length} new source material(s) fetched today.`,
    "",
  ]

  for (const l of learnings) {
    lines.push(`## ${l.title}`)
    lines.push("")
    lines.push(`- **Source:** [${l.source}](${l.sourceUrl})`)
    lines.push(`- **Summary:** ${l.summary}`)
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
    topTakeaway: artifacts.length > 0
      ? `${artifacts.length} new source material(s) fetched today. Review for applicability.`
      : "No new materials today.",
    markdownContent: lines.join("\n"),
  }
}

/**
 * Compile the daily learnings report for the given date.
 */
export async function compileDailyLearnings(date?: Date): Promise<CompiledReport> {
  const reportDate = date ?? new Date()
  const startOfDay = new Date(reportDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(reportDate)
  endOfDay.setHours(23, 59, 59, 999)
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
  }> = []

  try {
    artifacts = await prisma.sourceArtifact.findMany({
      where: {
        fetchedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        normalizedTitle: true,
        sourceUrl: true,
        publicationDate: true,
        sourceId: true,
        contentType: true,
        metadata: true,
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

  // Build input for Claude
  const artifactSummaries = artifacts.map((a, i) => {
    const pubDate = a.publicationDate?.toISOString().split("T")[0] ?? "unknown"
    return `[${i + 1}] Title: ${a.normalizedTitle}\n    Source: ${a.sourceId}\n    URL: ${a.sourceUrl}\n    Published: ${pubDate}\n    Type: ${a.contentType}`
  }).join("\n\n")

  const systemPrompt = `You are Pippen, an AI research assistant for a tax resolution firm. Your job is to summarize newly fetched tax authority materials into practitioner-friendly learning items.

For each source material provided, you must:
1. Write a clear, concise summary (2-3 sentences)
2. Explain why it matters for tax resolution practitioners (1-2 sentences)
3. List any action items or deadlines practitioners should note
4. Pick the single most important item as the "top takeaway" for the firm newsfeed

Respond in valid JSON with this exact structure:
{
  "learnings": [
    {
      "index": 1,
      "title": "...",
      "summary": "...",
      "relevance": "...",
      "actionItems": ["..."]
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
      topTakeaway: parsed.topTakeaway,
      markdownContent: mdLines.join("\n"),
    }
  } catch (err) {
    console.error("[Pippen] Claude call failed, falling back to template:", err)
    return buildFallbackReport(dateStr, artifacts)
  }
}
