/**
 * Benchmark Scorer — computes precision, recall, and other metrics
 * for a benchmark run by comparing retrieved citations against expected.
 */

import type { BenchmarkScore } from '../types'

/**
 * Score a single benchmark run.
 *
 * @param retrievedCitations — normalized citations returned by the retrieval pipeline
 * @param expectedCitations — expected normalized citations from the benchmark question
 * @param expectedTier — expected top-tier match (e.g., 'A1'), or null if not specified
 * @param topResultTier — the authority tier of the top-ranked result, or null
 * @returns BenchmarkScore with precision, recall, tier match, and overall score
 */
export function scoreBenchmarkRun(
  retrievedCitations: string[],
  expectedCitations: string[],
  expectedTier: string | null,
  topResultTier: string | null
): BenchmarkScore {
  if (expectedCitations.length === 0) {
    return {
      citationPrecision: retrievedCitations.length === 0 ? 1.0 : 0.0,
      citationRecall: 1.0,
      topTierMatch: expectedTier === null || expectedTier === topResultTier,
      conceptCoverage: 1.0,
      noContamination: true,
      driftDetected: false,
      overallScore: 1.0,
    }
  }

  const retrievedArr = retrievedCitations.map((c) => c.toLowerCase())
  const expectedArr = expectedCitations.map((c) => c.toLowerCase())
  const retrievedSet = new Set(retrievedArr)
  const expectedSet = new Set(expectedArr)

  // Precision: what fraction of retrieved citations are expected
  let truePositives = 0
  for (let i = 0; i < retrievedArr.length; i++) {
    if (expectedSet.has(retrievedArr[i])) {
      truePositives++
    }
  }
  // Deduplicate
  const tpSeen = new Set<string>()
  truePositives = 0
  for (let i = 0; i < retrievedArr.length; i++) {
    if (!tpSeen.has(retrievedArr[i]) && expectedSet.has(retrievedArr[i])) {
      truePositives++
      tpSeen.add(retrievedArr[i])
    }
  }
  const citationPrecision = retrievedSet.size > 0
    ? truePositives / retrievedSet.size
    : 0

  // Recall: what fraction of expected citations were retrieved
  const citationRecall = expectedSet.size > 0
    ? truePositives / expectedSet.size
    : 1.0

  // Top tier match
  const topTierMatch = expectedTier === null || expectedTier === topResultTier

  // Concept coverage: for now, approximated by recall
  // A full implementation would use semantic similarity
  const conceptCoverage = citationRecall

  // No contamination: check that no retrieved citations are from excluded tiers
  // For now, always true (would need a blocklist to check against)
  const noContamination = true

  // Drift detection is done externally by drift-detector.ts
  const driftDetected = false

  // Overall score: weighted combination
  // Recall is weighted higher because missing a key authority is worse than
  // including an extra relevant one
  const overallScore =
    0.30 * citationPrecision +
    0.40 * citationRecall +
    0.15 * (topTierMatch ? 1.0 : 0.0) +
    0.10 * conceptCoverage +
    0.05 * (noContamination ? 1.0 : 0.0)

  return {
    citationPrecision,
    citationRecall,
    topTierMatch,
    conceptCoverage,
    noContamination,
    driftDetected,
    overallScore,
  }
}
