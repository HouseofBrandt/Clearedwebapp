import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Knowledge Base | Cleared" }
import { prisma } from "@/lib/db"
import { KnowledgeList } from "@/components/knowledge/knowledge-list"

export default async function KnowledgePage() {
  await requireAuth()

  const [documents, totalChunks, approvedOutputs, topDocuments] = await Promise.all([
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

  const stats = {
    totalDocs: documents.length,
    totalChunks,
    approvedOutputs,
    topDocuments,
  }

  return <KnowledgeList documents={documents} stats={stats} />
}
