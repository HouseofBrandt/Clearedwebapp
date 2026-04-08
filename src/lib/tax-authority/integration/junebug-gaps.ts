/**
 * Junebug Gaps — scans for knowledge gaps by checking latest benchmark
 * runs for drift and identifying missing or stale citations.
 */

import { prisma } from '@/lib/db'
import type { GapReport } from '../types'

/**
 * Scan for knowledge gaps in the tax authority knowledge base.
 *
 * Checks:
 * 1. Benchmark runs with detected drift
 * 2. Stale authorities (not verified in > 365 days)
 * 3. Missing expected citations from benchmark questions
 *
 * @returns a GapReport summarizing all detected gaps
 */
export async function scanForGaps(): Promise<GapReport> {
  const report: GapReport = {
    corrections: 0,
    missingCitations: 0,
    staleCitations: 0,
    benchmarkDrifts: 0,
    gaps: [],
  }

  // Check benchmark drift — get the latest run per question
  const latestRuns = await prisma.benchmarkRun.findMany({
    where: { driftDetected: true },
    orderBy: { runDate: 'desc' },
    take: 50,
    include: { question: true },
  })

  // Deduplicate to latest per question
  const seenQuestions = new Set<string>()
  for (const run of latestRuns) {
    if (seenQuestions.has(run.questionId)) continue
    seenQuestions.add(run.questionId)

    report.benchmarkDrifts++
    report.gaps.push({
      type: 'benchmark_drift',
      description: `Benchmark drift detected for: "${run.question.question.substring(0, 100)}"`,
      issueArea: run.question.issueClusterId ?? undefined,
    })
  }

  // Check for missing citations — questions where recall < 0.5
  const lowRecallRuns = await prisma.benchmarkRun.findMany({
    where: {
      citationRecall: { lt: 0.5 },
    },
    orderBy: { runDate: 'desc' },
    take: 50,
    include: { question: true },
  })

  const seenMissing = new Set<string>()
  for (const run of lowRecallRuns) {
    if (seenMissing.has(run.questionId)) continue
    seenMissing.add(run.questionId)

    // Find which expected citations were missing
    const retrievedSet = new Set(run.retrievedCitations.map((c) => c.toLowerCase()))
    const missing = run.question.expectedCitations.filter(
      (c) => !retrievedSet.has(c.toLowerCase())
    )

    for (const citation of missing) {
      report.missingCitations++
      report.gaps.push({
        type: 'missing_citation',
        description: `Expected citation "${citation}" not retrieved for question: "${run.question.question.substring(0, 80)}"`,
        issueArea: run.question.issueClusterId ?? undefined,
      })
    }
  }

  // Check for stale authorities
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - 365)

  const staleAuthorities = await prisma.canonicalAuthority.findMany({
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
    take: 100,
  })

  for (const stale of staleAuthorities) {
    report.staleCitations++
    report.gaps.push({
      type: 'stale_citation',
      description: `Authority "${stale.citationString}" has not been verified in over 365 days`,
    })
  }

  return report
}
