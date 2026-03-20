import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { generateEmbeddings } from "@/lib/knowledge/embeddings"

export const maxDuration = 300

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

  const embedOnly = request.nextUrl.searchParams.get("embedOnly") === "true"

  if (embedOnly) {
    // Backfill mode: only generate embeddings for chunks that don't have them
    const unembedded = await prisma.$queryRawUnsafe(`
      SELECT id, content FROM knowledge_chunks
      WHERE "documentId" = $1 AND embedding IS NULL
      ORDER BY "chunkIndex" ASC
    `, params.documentId) as { id: string; content: string }[]

    if (unembedded.length === 0) {
      return NextResponse.json({ message: "All chunks already have embeddings", embeddedCount: 0, remaining: 0 })
    }

    const texts = unembedded.map((c) => c.content)
    let embeddedCount = 0

    for (let i = 0; i < texts.length; i += 50) {
      try {
        const batch = texts.slice(i, i + 50)
        const embeddings = await generateEmbeddings(batch)
        for (let j = 0; j < embeddings.length; j++) {
          const embStr = `[${embeddings[j].join(",")}]`
          await prisma.$executeRawUnsafe(
            `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
            embStr,
            unembedded[i + j].id
          ).catch(() => {})
        }
        embeddedCount += embeddings.length
      } catch {
        break // stop on error, can retry later
      }
      // Delay between batches to avoid rate limits
      if (i + 50 < texts.length) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }

    return NextResponse.json({
      embeddedCount,
      remaining: unembedded.length - embeddedCount,
    })
  }

  // Full re-index: delete existing chunks and re-ingest
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } })

  const result = await ingestDocument(doc.id, doc.sourceText)

  return NextResponse.json({
    chunksCreated: result.chunksCreated,
    embeddedCount: result.embeddedCount,
    warning: result.error,
  })
}
