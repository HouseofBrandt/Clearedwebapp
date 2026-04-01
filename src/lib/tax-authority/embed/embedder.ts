/**
 * Embedding pipeline for tax authority chunks.
 *
 * Reuses the existing OpenAI embedding infrastructure from the knowledge
 * module, prepending authority metadata to each chunk for improved
 * embedding quality.
 */

import { generateEmbedding, generateEmbeddings } from '@/lib/knowledge/embeddings'
import type { ChunkOutput } from '../chunk/chunker'

export interface EmbeddedChunk extends ChunkOutput {
  embedding: number[]
}

/**
 * Generate embeddings for chunks in batches.
 * Prepends authority metadata to improve embedding quality.
 */
export async function embedChunks(
  chunks: ChunkOutput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return []

  // Prepend metadata context to each chunk for better embedding quality
  const textsToEmbed = chunks.map((chunk) => {
    const prefix = `[${chunk.metadata.sourceType.toUpperCase()}] ${chunk.metadata.citationString}`
    return `${prefix}\n\n${chunk.content}`
  })

  const embeddings = await generateEmbeddings(textsToEmbed, onProgress)

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }))
}

// Re-export for convenience
export { generateEmbedding }
