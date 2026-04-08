import { prisma } from "@/lib/db"
import { IngestionClient } from "./ingestion-client"

async function loadIngestionRuns() {
  try {
    const runs = await prisma.ingestionRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        source: {
          select: { name: true, sourceId: true },
        },
      },
    })
    return runs.map((r) => ({
      id: r.id,
      sourceName: r.source.name,
      sourceId: r.sourceId,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      itemsFetched: r.itemsFetched,
      itemsNew: r.itemsNew,
      itemsChanged: r.itemsChanged,
      itemsSkipped: r.itemsSkipped,
      itemsFailed: r.itemsFailed,
      errorLog: r.errorLog,
    }))
  } catch {
    return null
  }
}

export default async function IngestionPage() {
  const runs = await loadIngestionRuns()
  return <IngestionClient runs={runs} />
}
