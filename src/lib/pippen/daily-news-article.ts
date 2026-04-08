/**
 * Daily News Article Generator
 *
 * Takes the compiled learnings report and generates a practitioner-facing
 * news article — a short blog post that appears on the Cleared dashboard.
 */

import { callClaude } from '@/lib/ai/client'
import { humanizeText } from '@/lib/ai/humanizer'
import type { CompiledReport } from './compile-learnings'

export interface DailyNewsArticle {
  [key: string]: unknown // Prisma JsonValue compatibility
  date: string
  headline: string
  body: string // markdown, 300-600 words
  sources: Array<{ title: string; url: string }>
  practiceAreas: string[] // which Cleared practice areas this touches
}

const SYSTEM_PROMPT = `You are writing a daily tax resolution news briefing for licensed practitioners (EAs, CPAs, attorneys) at a tax resolution firm. Write a short article (300-600 words) summarizing today's most important tax authority developments.

Style: Professional but accessible. Write like a senior partner sending a morning email to the team. No AI filler. Be specific about IRC sections, IRM references, and deadlines. Start with the most actionable item.

Format:
- Headline (punchy, specific, under 80 chars)
- Body (markdown, 2-4 sections with ### headers)
- End with 'What This Means for Your Cases' section with 2-3 bullet points

Do NOT use: 'landscape', 'crucial', 'pivotal', 'delve', 'underscores', 'highlights', 'fostering', 'showcasing', 'testament', 'tapestry', 'vibrant', 'in today's rapidly evolving'

Respond in valid JSON with this exact structure:
{
  "headline": "...",
  "body": "...",
  "sources": [{ "title": "...", "url": "..." }],
  "practiceAreas": ["OIC", "PENALTY", ...]
}

Practice area values must be from: OIC, IA, PENALTY, INNOCENT_SPOUSE, CNC, TFRP, ERC, UNFILED, AUDIT, CDP, COLLECTION, APPEALS, LITIGATION, GENERAL`

/**
 * Generate a daily news article from the compiled learnings report.
 * Returns a structured article ready for rendering.
 */
export async function generateDailyNewsArticle(
  report: CompiledReport
): Promise<DailyNewsArticle> {
  const date = report.date

  // If there are no learnings, return a minimal article
  if (!report.learnings || report.learnings.length === 0) {
    return {
      date,
      headline: 'No New Developments Today',
      body: `### Quiet Day\n\nNo new tax authority materials were published today. Check back tomorrow for the latest updates.`,
      sources: [],
      practiceAreas: [],
    }
  }

  // Build the user message from the compiled report
  const learningsSummary = report.learnings
    .map((l, i) => {
      const parts = [
        `[${i + 1}] ${l.title}`,
        `    Summary: ${l.summary}`,
        `    Source: ${l.source} (${l.sourceUrl})`,
        `    Relevance: ${l.relevance}`,
      ]
      if (l.actionItems && l.actionItems.length > 0) {
        parts.push(`    Action Items: ${l.actionItems.join('; ')}`)
      }
      if (l.publicationDate) {
        parts.push(`    Published: ${l.publicationDate}`)
      }
      return parts.join('\n')
    })
    .join('\n\n')

  const userMessage = `Today is ${date}. Here are ${report.learnings.length} tax authority developments to summarize:\n\n${learningsSummary}\n\nTop takeaway from the compilation: ${report.topTakeaway}`

  try {
    const response = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      model: 'claude-sonnet-4-6',
      temperature: 0.4,
      maxTokens: 2048,
    })

    // Parse JSON from Claude's response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[DailyNews] Claude response not valid JSON, using fallback')
      return buildFallbackArticle(report)
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      headline: string
      body: string
      sources: Array<{ title: string; url: string }>
      practiceAreas: string[]
    }

    return {
      date,
      headline: humanizeText(parsed.headline),
      body: humanizeText(parsed.body),
      sources: parsed.sources ?? [],
      practiceAreas: parsed.practiceAreas ?? [],
    }
  } catch (err) {
    console.error('[DailyNews] Claude call failed, using fallback:', err)
    return buildFallbackArticle(report)
  }
}

/**
 * Build a simple fallback article when Claude is unavailable.
 */
function buildFallbackArticle(report: CompiledReport): DailyNewsArticle {
  const lines = [
    `### Today's Developments`,
    '',
  ]

  for (const l of report.learnings) {
    lines.push(`**${l.title}** -- ${l.summary}`)
    lines.push('')
  }

  lines.push(`### What This Means for Your Cases`)
  lines.push('')
  lines.push(`- Review the ${report.learnings.length} new item(s) for applicability to active matters.`)
  lines.push(`- ${report.topTakeaway}`)

  const sources = report.learnings.map((l) => ({
    title: l.title,
    url: l.sourceUrl,
  }))

  return {
    date: report.date,
    headline: `${report.learnings.length} Tax Authority Update${report.learnings.length === 1 ? '' : 's'} for ${report.date}`,
    body: lines.join('\n'),
    sources,
    practiceAreas: ['GENERAL'],
  }
}
