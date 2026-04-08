import { prisma } from "@/lib/db"
import { SourcesClient } from "./sources-client"

async function loadSources() {
  try {
    const sources = await prisma.sourceRegistry.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        sourceId: true,
        name: true,
        description: true,
        endpoint: true,
        format: true,
        cadence: true,
        defaultTier: true,
        enabled: true,
        lastFetchedAt: true,
        lastSuccessAt: true,
        lastError: true,
        fetchCount: true,
        errorCount: true,
      },
    })
    return sources.map((s) => ({
      ...s,
      lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
    }))
  } catch {
    return null
  }
}

export default async function SourcesPage() {
  const sources = await loadSources()
  return <SourcesClient sources={sources} />
}
