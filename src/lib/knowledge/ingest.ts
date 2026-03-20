import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { ensureVectorColumn } from "./vector-setup"
import { prisma } from "@/lib/db"

export interface IngestProgress {
  phase: "chunking" | "embedding" | "storing"
  percent: number
  detail?: string
}

export async function ingestDocument(
  documentId: string,
  text: string,
  onProgress?: (progress: IngestProgress) => void,
): Promise<{ chunksCreated: number; error?: string }> {
  // Ensure pgvector extension and embedding column exist
  await ensureVectorColumn()

  const chunks = chunkDocument(text, {
    maxChunkSize: 2000,
    overlap: 200,
    respectHeaders: true,
  })

  if (chunks.length === 0) {
    return { chunksCreated: 0, error: "No extractable content" }
  }

  onProgress?.({ phase: "chunking", percent: 15, detail: `${chunks.length} chunks created` })

  // Generate embeddings for all chunks (batched)
  const texts = chunks.map((c) => c.content)
  let embeddings: number[][] | null = null

  try {
    embeddings = await generateEmbeddings(texts, (completed, total) => {
      // Embedding phase spans 15%–85%
      const pct = 15 + Math.round((completed / total) * 70)
      onProgress?.({ phase: "embedding", percent: pct, detail: `Embedding ${completed}/${total} chunks` })
    })
  } catch (error: any) {
    console.error("[Knowledge] Embedding generation failed:", error.message)
  }

  onProgress?.({ phase: "storing", percent: 85, detail: "Saving chunks to database" })

  // Store chunks — with embeddings if available, without if not
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    const created = await prisma.knowledgeChunk.create({
      data: {
        documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        sectionHeader: chunk.sectionHeader || null,
        tokenCount: Math.ceil(chunk.content.length / 4),
        metadata: chunk.metadata as any,
      },
    })

    // Set embedding via raw SQL (Prisma doesn't support vector type)
    if (embeddings && embeddings[i]) {
      const embeddingStr = `[${embeddings[i].join(",")}]`
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
        embeddingStr,
        created.id
      ).catch((e: any) => {
        console.error("[Knowledge] Failed to set embedding for chunk:", e.message)
      })
    }
  }

  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { chunkCount: chunks.length },
  })

  if (!embeddings) {
    return {
      chunksCreated: chunks.length,
      error: "Chunks created but embeddings failed. Full-text search will still work.",
    }
  }

  return { chunksCreated: chunks.length }
}
