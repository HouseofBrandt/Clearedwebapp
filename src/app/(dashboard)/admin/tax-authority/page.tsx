import { prisma } from "@/lib/db"
import { TaxAuthorityOverviewClient } from "./overview-client"

async function loadOverviewData() {
  try {
    const [sources, ingestionSummary, benchmarkStats, latestDigest] = await Promise.all([
      prisma.sourceRegistry.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sourceId: true,
          enabled: true,
          lastFetchedAt: true,
          lastSuccessAt: true,
          lastErrorAt: true,
          lastError: true,
          errorCount: true,
        },
      }),
      prisma.ingestionRun.aggregate({
        where: {
          startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        _sum: {
          itemsNew: true,
          itemsChanged: true,
          itemsSkipped: true,
          itemsFailed: true,
        },
        _count: true,
      }),
      prisma.benchmarkRun.aggregate({
        where: {
          runDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _avg: { citationPrecision: true, citationRecall: true },
        _count: true,
        _sum: { driftDetected: false } as any,
      }),
      prisma.dailyDigest.findFirst({
        orderBy: { digestDate: "desc" },
      }),
    ])

    // Count drifts separately
    const driftCount = await prisma.benchmarkRun.count({
      where: {
        runDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        driftDetected: true,
      },
    }).catch(() => 0)

    return {
      sources: sources.map((s) => ({
        ...s,
        lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        lastErrorAt: s.lastErrorAt?.toISOString() ?? null,
      })),
      ingestionSummary: {
        runsToday: ingestionSummary._count,
        newItems: ingestionSummary._sum.itemsNew ?? 0,
        changedItems: ingestionSummary._sum.itemsChanged ?? 0,
        skippedItems: ingestionSummary._sum.itemsSkipped ?? 0,
        failedItems: ingestionSummary._sum.itemsFailed ?? 0,
      },
      benchmarkStats: {
        avgPrecision: benchmarkStats._avg.citationPrecision ?? 0,
        avgRecall: benchmarkStats._avg.citationRecall ?? 0,
        totalRuns: benchmarkStats._count,
        driftCount,
      },
      latestDigest: latestDigest
        ? {
            id: latestDigest.id,
            digestDate: latestDigest.digestDate.toISOString(),
            newAuthorities: latestDigest.newAuthorities,
            changedAuthorities: latestDigest.changedAuthorities,
            supersededItems: latestDigest.supersededItems,
            benchmarkDrifts: latestDigest.benchmarkDrifts,
            summary: latestDigest.summary,
            publishedAt: latestDigest.publishedAt?.toISOString() ?? null,
          }
        : null,
    }
  } catch {
    return null
  }
}

export default async function TaxAuthorityOverviewPage() {
  const data = await loadOverviewData()
  return <TaxAuthorityOverviewClient data={data} />
}
