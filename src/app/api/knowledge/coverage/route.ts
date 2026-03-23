import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const [totalDocs, totalChunks, byCategory, bySourceType, staleCount, recentlyAdded] = await Promise.all([
    prisma.knowledgeDocument.count({ where: { isActive: true } }),
    prisma.knowledgeChunk.count(),
    prisma.knowledgeDocument.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: true,
    }),
    prisma.knowledgeDocument.groupBy({
      by: ["sourceType"],
      where: { isActive: true },
      _count: true,
    }),
    // Documents not referenced in 6+ months
    prisma.knowledgeDocument.count({
      where: {
        isActive: true,
        OR: [
          { lastReferencedAt: null },
          { lastReferencedAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    // Recently added (last 30 days)
    prisma.knowledgeDocument.count({
      where: {
        isActive: true,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  return Response.json({
    totalDocuments: totalDocs,
    totalChunks,
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    bySourceType: bySourceType.map((s) => ({ sourceType: s.sourceType, count: s._count })),
    staleDocuments: staleCount,
    recentlyAdded,
  })
}
