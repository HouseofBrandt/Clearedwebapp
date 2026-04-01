/**
 * Authority chunk indexer — stores embedded chunks in the AuthorityChunk
 * table and manages pgvector embeddings via raw SQL.
 */

import { prisma } from '@/lib/db'
import type { EmbeddedChunk } from './embedder'

/**
 * Store embedded chunks in the AuthorityChunk table.
 * Creates or updates chunks based on contentHash dedup.
 */
export async function indexChunks(
  authorityId: string,
  chunks: EmbeddedChunk[],
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0

  for (const chunk of chunks) {
    // Check if chunk already exists with same content hash
    const existing = await prisma.authorityChunk.findFirst({
      where: {
        authorityId,
        contentHash: chunk.metadata.contentHash,
      },
    })

    if (existing) {
      skipped++
      continue
    }

    // Check if there's an existing chunk at same index (update case)
    const atIndex = await prisma.authorityChunk.findFirst({
      where: {
        authorityId,
        chunkIndex: chunk.chunkIndex,
      },
    })

    const data = {
      authorityId,
      chunkType: chunk.metadata.chunkType,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.metadata.tokenCount,
      authorityTier: chunk.metadata.authorityTier as any,
      authorityStatus: chunk.metadata.authorityStatus as any,
      precedentialStatus: chunk.metadata.precedentialStatus as any,
      publicationDate: chunk.metadata.publicationDate,
      effectiveDate: chunk.metadata.effectiveDate,
      citationString: chunk.metadata.citationString,
      parentCitation: chunk.metadata.parentCitation,
      jurisdiction: chunk.metadata.jurisdiction,
      issueTags: chunk.metadata.issueTags,
      sourceUrl: chunk.metadata.sourceUrl,
      contentHash: chunk.metadata.contentHash,
      superseded: chunk.metadata.superseded,
    }

    if (atIndex) {
      await prisma.authorityChunk.update({
        where: { id: atIndex.id },
        data,
      })
      updated++
    } else {
      await prisma.authorityChunk.create({ data })
      created++
    }
  }

  // Store embeddings via raw SQL (Prisma doesn't support pgvector natively)
  for (const chunk of chunks) {
    if (!chunk.embedding?.length) continue

    const existing = await prisma.authorityChunk.findFirst({
      where: { authorityId, contentHash: chunk.metadata.contentHash },
    })

    if (existing) {
      const vectorStr = `[${chunk.embedding.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE authority_chunks SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        existing.id,
      )
    }
  }

  return { created, updated, skipped }
}
