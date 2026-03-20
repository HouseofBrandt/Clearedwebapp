import { chunkDocument } from "./chunker"
import { generateEmbeddings } from "./embeddings"
import { ensureVectorColumn } from "./vector-setup"
import { prisma } from "@/lib/db"
import { trackError } from "@/lib/error-tracking"

export interface IngestProgress {
  phase: "chunking" | "embedding" | "storing"
  percent: number
  detail?: string
}

const EMBED_BATCH_SIZE = 50   // chunks per OpenAI call
const EMBED_DELAY_MS = 1000   // 1 second between batches
const MAX_EMBED_TIME_MS = 180_000 // 3 minute budget for embeddings

export async function ingestDocument(
  documentId: string,
  text: string,
  onProgress?: (progress: IngestProgress) => void,
): Promise<{ chunksCreated: number; embeddedCount: number; error?: string }> {
  // Ensure pgvector extension and embedding column exist
  await ensureVectorColumn()

  const chunks = chunkDocument(text, {
    maxChunkSize: 2000,
    overlap: 200,
    respectHeaders: true,
  })

  if (chunks.length === 0) {
    return { chunksCreated: 0, embeddedCount: 0, error: "No extractable content" }
  }

  onProgress?.({ phase: "chunking", percent: 10, detail: `${chunks.length} chunks created` })

  // Phase 1: Store ALL chunks first (so full-text search works immediately)
  // Uses createMany + single fetch instead of N sequential inserts
  onProgress?.({ phase: "storing", percent: 12, detail: "Saving chunks to database..." })

  const chunkRecords = chunks.map((chunk) => ({
    documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    sectionHeader: chunk.sectionHeader || null,
    tokenCount: Math.ceil(chunk.content.length / 4),
  }))
  await prisma.knowledgeChunk.createMany({ data: chunkRecords })

  onProgress?.({ phase: "storing", percent: 22, detail: `Saved ${chunks.length} chunks` })

  const createdChunks = await prisma.knowledgeChunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true },
  })

  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { chunkCount: chunks.length },
  })

  // Phase 2: Progressive embedding with time budget
  const texts = chunks.map((c) => c.content)
  const embedStart = Date.now()
  let embeddedCount = 0

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    // Check time budget
    if (Date.now() - embedStart > MAX_EMBED_TIME_MS) {
      console.warn(`[Knowledge] Embedding time budget exceeded at chunk ${i}/${texts.length}. Remaining chunks will use text-only search.`)
      break
    }

    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    try {
      const batchEmbeddings = await generateEmbeddings(batch)
      // Write these embeddings immediately
      for (let j = 0; j < batchEmbeddings.length; j++) {
        const chunkIdx = i + j
        if (createdChunks[chunkIdx]) {
          const embStr = `[${batchEmbeddings[j].join(",")}]`
          await prisma.$executeRawUnsafe(
            `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
            embStr,
            createdChunks[chunkIdx].id
          ).catch(() => {})
        }
      }
      embeddedCount += batchEmbeddings.length
    } catch (err: any) {
      console.error(`[Knowledge] Embedding batch ${i} failed:`, err.message)
      trackError({
        route: "knowledge/ingest",
        error: err,
        metadata: { documentId, batchIndex: i, chunksTotal: chunks.length },
      }).catch(() => {})
      // If rate limited, wait longer and retry this batch
      if (err.message?.includes("rate") || err?.status === 429) {
        await new Promise(r => setTimeout(r, 5000))
        i -= EMBED_BATCH_SIZE // retry this batch
        continue
      }
      // Other errors: stop embedding, chunks still saved for full-text search
      break
    }

    // Progress: embedding spans 25%–95%
    const pct = 25 + Math.round((embeddedCount / texts.length) * 70)
    onProgress?.({ phase: "embedding", percent: pct, detail: `Embedding ${embeddedCount}/${texts.length} chunks` })

    // Delay between batches to avoid rate limits
    if (i + EMBED_BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, EMBED_DELAY_MS))
    }
  }

  console.log(`[Knowledge] Embedded ${embeddedCount}/${chunks.length} chunks`)

  if (embeddedCount === 0) {
    return {
      chunksCreated: chunks.length,
      embeddedCount: 0,
      error: "Chunks created but embeddings failed. Full-text search will still work.",
    }
  }

  if (embeddedCount < chunks.length) {
    return {
      chunksCreated: chunks.length,
      embeddedCount,
      error: `Embedded ${embeddedCount}/${chunks.length} chunks (time budget reached). Use "Backfill Embeddings" to complete the rest.`,
    }
  }

  return { chunksCreated: chunks.length, embeddedCount }
}
