import { prisma } from "@/lib/db"
import { chunkDocument } from "@/lib/knowledge/chunker"
import { generateEmbedding, generateEmbeddings } from "@/lib/knowledge/embeddings"

/**
 * Chunk a document's extractedText into overlapping windows, embed each,
 * and write DocumentChunk rows.
 *
 * Chunk size is tuned for form-field search: 400 tokens (~1600 chars) with
 * 50-token overlap. This is smaller than the knowledge-base default (2000
 * chars) because form values are typically single line items within a
 * document — a tighter window improves retrieval precision.
 *
 * Idempotent: if chunks already exist for this document, they are deleted
 * and re-written. Safe to call after an extractedText update.
 *
 * Embeddings are persisted via raw SQL because the pgvector column type
 * is not supported by Prisma's type-safe API.
 */
export async function chunkAndEmbedDocument(documentId: string): Promise<{
  chunksWritten: number
  embeddedChunks: number
  durationMs: number
}> {
  const started = Date.now()

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, extractedText: true },
  })
  if (!doc || !doc.extractedText) {
    return { chunksWritten: 0, embeddedChunks: 0, durationMs: Date.now() - started }
  }

  const chunks = chunkDocument(doc.extractedText, {
    maxChunkSize: 1600,
    overlap: 200,
    respectHeaders: false,
  })
  if (chunks.length === 0) {
    return { chunksWritten: 0, embeddedChunks: 0, durationMs: Date.now() - started }
  }

  // Replace existing chunks.
  await prisma.documentChunk.deleteMany({ where: { documentId } })

  // Write the rows first (without embeddings), then backfill embeddings.
  // This ensures that a rate-limited embedding call doesn't leave orphan rows.
  const rows = chunks.map((c) => ({
    documentId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    pageNumber: null as number | null,
    tokenCount: Math.ceil(c.content.length / 4),
  }))
  await prisma.documentChunk.createMany({ data: rows })

  // Embed in a single batched call where possible.
  let embeddings: number[][] = []
  try {
    embeddings = await generateEmbeddings(chunks.map((c) => c.content))
  } catch (err: any) {
    console.warn("[documents/chunking] embedding failed; chunks written without vectors", {
      documentId,
      error: err?.message,
    })
    return { chunksWritten: rows.length, embeddedChunks: 0, durationMs: Date.now() - started }
  }

  // Write embeddings via raw SQL. Prisma doesn't expose the vector type.
  for (let i = 0; i < chunks.length; i++) {
    const emb = embeddings[i]
    if (!emb || emb.length === 0) continue
    const literal = `[${emb.join(",")}]`
    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE "documentId" = $2 AND "chunkIndex" = $3`,
      literal,
      documentId,
      chunks[i].chunkIndex,
    )
  }

  return {
    chunksWritten: rows.length,
    embeddedChunks: embeddings.length,
    durationMs: Date.now() - started,
  }
}

/**
 * Embed a single query string for vector similarity search.
 * Thin wrapper around generateEmbedding so consumers of the document-search
 * module don't need to reach into the knowledge/ namespace.
 */
export async function embedQuery(query: string): Promise<number[]> {
  return generateEmbedding(query)
}
