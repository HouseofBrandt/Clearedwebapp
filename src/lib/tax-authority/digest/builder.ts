/**
 * Daily Digest Builder — assembles a summary of the day's ingestion
 * activity, supersession scans, and benchmark results.
 */

import { prisma } from '@/lib/db'

/**
 * Build the daily digest for a given date (defaults to today).
 *
 * Queries:
 * - Today's ingestion runs (new/changed authorities)
 * - Supersession scan results (via authority status changes)
 * - Benchmark runs with drift detection
 * - Knowledge gaps (stale or missing authorities)
 */
export async function buildDailyDigest(date?: Date): Promise<{
  digestDate: Date
  newAuthorities: number
  changedAuthorities: number
  supersededItems: number
  benchmarkDrifts: number
  knowledgeGaps: number
  summary: string
  details: Record<string, unknown>
}> {
  const digestDate = date ?? new Date()
  const startOfDay = new Date(digestDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(digestDate)
  endOfDay.setHours(23, 59, 59, 999)

  // Query today's ingestion runs
  const ingestionRuns = await prisma.ingestionRun.findMany({
    where: {
      startedAt: { gte: startOfDay, lte: endOfDay },
    },
  })

  const newAuthorities = ingestionRuns.reduce((sum, run) => sum + run.itemsNew, 0)
  const changedAuthorities = ingestionRuns.reduce((sum, run) => sum + run.itemsChanged, 0)

  // Count authorities superseded today
  const supersededItems = await prisma.canonicalAuthority.count({
    where: {
      authorityStatus: { in: ['SUPERSEDED', 'WITHDRAWN', 'ARCHIVED'] },
      updatedAt: { gte: startOfDay, lte: endOfDay },
    },
  })

  // Query today's benchmark runs for drift
  const benchmarkRuns = await prisma.benchmarkRun.findMany({
    where: {
      runDate: { gte: startOfDay, lte: endOfDay },
    },
  })
  const benchmarkDrifts = benchmarkRuns.filter((r) => r.driftDetected).length

  // Count stale authorities as knowledge gaps
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - 365)

  const knowledgeGaps = await prisma.canonicalAuthority.count({
    where: {
      authorityStatus: 'CURRENT',
      OR: [
        { lastVerifiedAt: { lt: staleThreshold } },
        {
          lastVerifiedAt: null,
          createdAt: { lt: staleThreshold },
        },
      ],
    },
  })

  // Build markdown summary
  const summaryLines: string[] = [
    `# Daily Digest - ${digestDate.toISOString().split('T')[0]}`,
    '',
  ]

  if (ingestionRuns.length > 0) {
    summaryLines.push(`## Ingestion`)
    summaryLines.push(`- **${ingestionRuns.length}** ingestion runs completed`)
    summaryLines.push(`- **${newAuthorities}** new authorities ingested`)
    summaryLines.push(`- **${changedAuthorities}** authorities updated`)
    summaryLines.push('')
  } else {
    summaryLines.push(`## Ingestion`)
    summaryLines.push(`- No ingestion runs today`)
    summaryLines.push('')
  }

  if (supersededItems > 0) {
    summaryLines.push(`## Supersession`)
    summaryLines.push(`- **${supersededItems}** authorities superseded/withdrawn/archived`)
    summaryLines.push('')
  }

  if (benchmarkRuns.length > 0) {
    const avgScore = benchmarkRuns.reduce(
      (sum, r) => sum + (r.answerQuality ?? 0),
      0
    ) / benchmarkRuns.length
    summaryLines.push(`## Benchmarks`)
    summaryLines.push(`- **${benchmarkRuns.length}** benchmark questions evaluated`)
    summaryLines.push(`- Average score: **${(avgScore * 100).toFixed(1)}%**`)
    if (benchmarkDrifts > 0) {
      summaryLines.push(`- **${benchmarkDrifts}** drift(s) detected`)
    }
    summaryLines.push('')
  }

  if (knowledgeGaps > 0) {
    summaryLines.push(`## Knowledge Gaps`)
    summaryLines.push(`- **${knowledgeGaps}** stale authorities need reverification`)
    summaryLines.push('')
  }

  const summary = summaryLines.join('\n')

  const details: Record<string, unknown> = {
    ingestionRuns: ingestionRuns.map((r) => ({
      sourceId: r.sourceId,
      status: r.status,
      itemsFetched: r.itemsFetched,
      itemsNew: r.itemsNew,
      itemsChanged: r.itemsChanged,
      itemsFailed: r.itemsFailed,
    })),
    benchmarkRuns: benchmarkRuns.map((r) => ({
      questionId: r.questionId,
      citationPrecision: r.citationPrecision,
      citationRecall: r.citationRecall,
      topTierMatch: r.topTierMatch,
      answerQuality: r.answerQuality,
      driftDetected: r.driftDetected,
    })),
  }

  return {
    digestDate,
    newAuthorities,
    changedAuthorities,
    supersededItems,
    benchmarkDrifts,
    knowledgeGaps,
    summary,
    details,
  }
}
