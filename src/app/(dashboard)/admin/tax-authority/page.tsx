import { prisma } from "@/lib/db"
import { TaxAuthorityOverviewClient } from "./overview-client"

async function loadOverviewData() {
  try {
    // Query each independently so one failure doesn't break the whole page
    const sources = await prisma.sourceRegistry.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, sourceId: true, enabled: true,
        lastFetchedAt: true, lastSuccessAt: true, lastErrorAt: true,
        lastError: true, errorCount: true,
      },
    }).catch(() => [])

    const ingestionAgg = await prisma.ingestionRun.aggregate({
      where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _sum: { itemsNew: true, itemsChanged: true, itemsSkipped: true, itemsFailed: true },
      _count: true,
    }).catch(() => ({ _sum: { itemsNew: null, itemsChanged: null, itemsSkipped: null, itemsFailed: null }, _count: 0 }))

    const benchmarkAgg = await prisma.benchmarkRun.aggregate({
      where: { runDate: { gte: new Date(Date.now() - 7 * 86400000) } },
      _avg: { citationPrecision: true, citationRecall: true },
      _count: true,
    }).catch(() => ({ _avg: { citationPrecision: null, citationRecall: null }, _count: 0 }))

    const driftCount = await prisma.benchmarkRun.count({
      where: { runDate: { gte: new Date(Date.now() - 7 * 86400000) }, driftDetected: true },
    }).catch(() => 0)

    const latestDigest = await prisma.dailyDigest.findFirst({
      orderBy: { digestDate: "desc" },
    }).catch(() => null)

    return {
      sources: sources.map((s) => ({
        ...s,
        lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        lastErrorAt: s.lastErrorAt?.toISOString() ?? null,
      })),
      ingestionSummary: {
        runsToday: ingestionAgg._count,
        newItems: ingestionAgg._sum.itemsNew ?? 0,
        changedItems: ingestionAgg._sum.itemsChanged ?? 0,
        skippedItems: ingestionAgg._sum.itemsSkipped ?? 0,
        failedItems: ingestionAgg._sum.itemsFailed ?? 0,
      },
      benchmarkStats: {
        avgPrecision: benchmarkAgg._avg.citationPrecision ?? 0,
        avgRecall: benchmarkAgg._avg.citationRecall ?? 0,
        totalRuns: benchmarkAgg._count,
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
