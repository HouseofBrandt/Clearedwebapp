/**
 * Benchmark Runner — replays benchmark questions through the retrieval
 * pipeline and scores the results.
 */

import { prisma } from '@/lib/db'
import { hybridRetrieve } from '../retrieval/retriever'
import { rerankChunks } from '../retrieval/reranker'
import { scoreBenchmarkRun } from './scorer'
import { detectDrift } from './drift-detector'

/**
 * Run all active benchmark questions through the retrieval pipeline,
 * score results, detect drift, and store BenchmarkRun records.
 *
 * @returns summary of the benchmark run
 */
export async function runBenchmarks(): Promise<{
  totalRun: number
  avgScore: number
  drifts: number
}> {
  // Fetch all active benchmark questions
  const questions = await prisma.benchmarkQuestion.findMany({
    where: { isActive: true },
  })

  let totalScore = 0
  let drifts = 0
  let totalRun = 0

  for (const question of questions) {
    try {
      // Run the question through the retrieval pipeline
      const retrieved = await hybridRetrieve({
        query: question.question,
        limit: 30,
      })

      const ranked = rerankChunks(retrieved)

      // Extract citations from ranked results
      const retrievedCitations = ranked.map((r) => r.metadata.citationString)
      const topResultTier = ranked.length > 0
        ? ranked[0].metadata.authorityTier
        : null

      // Score the run
      const score = scoreBenchmarkRun(
        retrievedCitations,
        question.expectedCitations,
        question.expectedTier,
        topResultTier
      )

      // Get the previous run to detect drift
      const previousRun = await prisma.benchmarkRun.findFirst({
        where: { questionId: question.id },
        orderBy: { runDate: 'desc' },
      })

      const driftDetected = previousRun
        ? detectDrift(retrievedCitations, previousRun.retrievedCitations)
        : false

      if (driftDetected) drifts++

      // Store the benchmark run
      await prisma.benchmarkRun.create({
        data: {
          questionId: question.id,
          retrievedCitations,
          citationPrecision: score.citationPrecision,
          citationRecall: score.citationRecall,
          topTierMatch: score.topTierMatch,
          answerQuality: score.overallScore,
          driftDetected,
          metadata: {
            conceptCoverage: score.conceptCoverage,
            noContamination: score.noContamination,
            totalRetrieved: ranked.length,
          },
        },
      })

      totalScore += score.overallScore
      totalRun++
    } catch (error) {
      console.error(
        `[Benchmark] Failed to run question ${question.id}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  return {
    totalRun,
    avgScore: totalRun > 0 ? totalScore / totalRun : 0,
    drifts,
  }
}
