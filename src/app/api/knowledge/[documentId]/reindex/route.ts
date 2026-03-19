import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"

export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: params.documentId },
  })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Delete existing chunks
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } })

  // Re-ingest
  const result = await ingestDocument(doc.id, doc.sourceText)

  return NextResponse.json({
    chunksCreated: result.chunksCreated,
    warning: result.error,
  })
}
