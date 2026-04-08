import { prisma } from "@/lib/db"
import { DigestClient } from "./digest-client"

async function loadDigests() {
  try {
    const digests = await prisma.dailyDigest.findMany({
      orderBy: { digestDate: "desc" },
      take: 30,
    })
    return digests.map((d) => ({
      id: d.id,
      digestDate: d.digestDate.toISOString(),
      newAuthorities: d.newAuthorities,
      changedAuthorities: d.changedAuthorities,
      supersededItems: d.supersededItems,
      benchmarkDrifts: d.benchmarkDrifts,
      knowledgeGaps: d.knowledgeGaps,
      summary: d.summary,
      details: d.details as Record<string, unknown>,
      publishedAt: d.publishedAt?.toISOString() ?? null,
    }))
  } catch {
    return null
  }
}

export default async function DigestPage() {
  const digests = await loadDigests()
  return <DigestClient digests={digests} />
}
