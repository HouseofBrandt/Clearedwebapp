import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { prisma } from "@/lib/db"

export async function ingestDocument(
  documentId: string,
  text: string
): Promise<{ chunksCreated: number; error?: string }> {
  const chunks = chunkDocument(text, {
    maxChunkSize: 2000,
    overlap: 200,
    respectHeaders: true,
  })

  if (chunks.length === 0) {
    return { chunksCreated: 0, error: "No extractable content" }
  }

  // Generate embeddings for all chunks (batched)
  const texts = chunks.map((c) => c.content)
  let embeddings: number[][] | null = null

  try {
    embeddings = await generateEmbeddings(texts)
  } catch (error: any) {
    console.error("[Knowledge] Embedding generation failed:", error.message)
  }

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
