import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Knowledge Base | Cleared" }
import { prisma } from "@/lib/db"
import { KnowledgeList } from "@/components/knowledge/knowledge-list"

export default async function KnowledgePage() {
  await requireAuth()

  let documents: any[] = []
  let totalChunks = 0
  let approvedOutputs = 0
  let topDocuments: any[] = []
  let embeddingCounts: Record<string, number> = {}

  try {
    ;[documents, totalChunks, approvedOutputs, topDocuments] = await Promise.all([
      prisma.knowledgeDocument.findMany({
        include: {
          uploadedBy: { select: { id: true, name: true } },
          _count: { select: { chunks: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.knowledgeChunk.count(),
      prisma.knowledgeDocument.count({ where: { category: "APPROVED_OUTPUT" } }),
      prisma.knowledgeDocument.findMany({
        where: { hitCount: { gt: 0 } },
        select: { title: true, hitCount: true },
        orderBy: { hitCount: "desc" },
        take: 5,
      }),
    ])

    // Get embedding counts per document for backfill status
    const docIds = documents.map((d: any) => d.id)
    if (docIds.length > 0) {
      try {
        const counts = await prisma.$queryRawUnsafe(`
          SELECT "documentId", COUNT(embedding)::int as embedded_count
          FROM knowledge_chunks
          WHERE "documentId" = ANY($1::text[])
          GROUP BY "documentId"
        `, docIds) as { documentId: string; embedded_count: number }[]
        for (const row of counts) {
          embeddingCounts[row.documentId] = row.embedded_count
        }
      } catch (rawErr) {
        console.error("[Knowledge] Embedding count query failed:", rawErr)
      }
    }
  } catch (err) {
    console.error("[Knowledge] Failed to load data:", err)
  }

  const stats = {
    totalDocs: documents.length,
    totalChunks,
    approvedOutputs,
    topDocuments,
  }

  return <div className="page-enter"><KnowledgeList documents={documents} stats={stats} embeddingCounts={embeddingCounts} /></div>
}
