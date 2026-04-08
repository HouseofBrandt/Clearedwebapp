import { prisma } from "@/lib/db"
import { BenchmarksClient } from "./benchmarks-client"

async function loadBenchmarks() {
  try {
    const questions = await prisma.benchmarkQuestion.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        issueCluster: {
          select: { displayName: true },
        },
        runs: {
          orderBy: { runDate: "desc" },
          take: 1,
          select: {
            id: true,
            runDate: true,
            citationPrecision: true,
            citationRecall: true,
            topTierMatch: true,
            answerQuality: true,
            driftDetected: true,
            retrievedCitations: true,
          },
        },
      },
    })
    return questions.map((q) => {
      const latestRun = q.runs[0] ?? null
      return {
        id: q.id,
        question: q.question,
        expectedCitations: q.expectedCitations,
        expectedTier: q.expectedTier,
        issueCluster: q.issueCluster?.displayName ?? null,
        latestRun: latestRun
          ? {
              id: latestRun.id,
              runDate: latestRun.runDate.toISOString(),
              citationPrecision: latestRun.citationPrecision,
              citationRecall: latestRun.citationRecall,
              topTierMatch: latestRun.topTierMatch,
              answerQuality: latestRun.answerQuality,
              driftDetected: latestRun.driftDetected,
              retrievedCitations: latestRun.retrievedCitations,
            }
          : null,
      }
    })
  } catch {
    return null
  }
}

export default async function BenchmarksPage() {
  const benchmarks = await loadBenchmarks()
  return <BenchmarksClient benchmarks={benchmarks} />
}
