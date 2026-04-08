import { prisma } from "@/lib/db"
import { AuthoritiesClient } from "./authorities-client"

async function loadAuthorities() {
  try {
    const authorities = await prisma.canonicalAuthority.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        citationString: true,
        normalizedCitation: true,
        title: true,
        authorityTier: true,
        authorityStatus: true,
        precedentialStatus: true,
        promotionLayer: true,
        jurisdiction: true,
        effectiveDate: true,
        publicationDate: true,
        _count: {
          select: {
            versions: true,
            chunks: true,
          },
        },
      },
    })
    return authorities.map((a) => ({
      id: a.id,
      citationString: a.citationString,
      normalizedCitation: a.normalizedCitation,
      title: a.title,
      authorityTier: a.authorityTier,
      authorityStatus: a.authorityStatus,
      precedentialStatus: a.precedentialStatus,
      promotionLayer: a.promotionLayer,
      jurisdiction: a.jurisdiction,
      effectiveDate: a.effectiveDate?.toISOString() ?? null,
      publicationDate: a.publicationDate?.toISOString() ?? null,
      versionCount: a._count.versions,
      chunkCount: a._count.chunks,
    }))
  } catch {
    return null
  }
}

export default async function AuthoritiesPage() {
  const authorities = await loadAuthorities()
  return <AuthoritiesClient authorities={authorities} />
}
