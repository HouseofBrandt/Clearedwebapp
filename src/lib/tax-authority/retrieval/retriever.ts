/**
 * Hybrid Retriever — vector + full-text search on AuthorityChunk.
 *
 * Uses pgvector cosine similarity combined with PostgreSQL ts_rank for
 * full-text search. Filters by superseded status, authority status, and
 * optionally by tiers and promotion layers.
 */

import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/knowledge/embeddings'
import type { AuthorityTier } from '../types'

export interface RetrievalOptions {
  query: string
  tiers?: AuthorityTier[]
  limit?: number
  includeSuperseded?: boolean
  promotionLayers?: string[]
}

export interface RetrievedChunk {
  id: string
  content: string
  citationString: string
  authorityTier: string
  authorityStatus: string
  precedentialStatus: string
  chunkType: string
  sourceUrl: string | null
  issueTags: string[]
  similarityScore: number
}

/**
 * Perform hybrid retrieval: vector similarity + full-text search.
 *
 * 1. Generate an embedding for the query.
 * 2. Run a raw SQL query that combines cosine similarity with ts_rank.
 * 3. Filter by superseded=false, authorityStatus IN (CURRENT, PROPOSED).
 * 4. Prefer CURATED/DISTILLED promotion layers, fall back to RAW.
 * 5. Return up to `limit` candidates (default 30).
 */
export async function hybridRetrieve(options: RetrievalOptions): Promise<RetrievedChunk[]> {
  const {
    query,
    tiers,
    limit = 30,
    includeSuperseded = false,
    promotionLayers,
  } = options

  // Generate embedding for the query
  const embedding = await generateEmbedding(query)
  const embeddingStr = `[${embedding.join(',')}]`

  // Build dynamic parameter index — $1 is always the embedding vector
  let nextParamIdx = 2

  // Build tier filter
  const tierParam = tiers && tiers.length > 0 ? tiers : null
  const tierFilter = tierParam ? `AND ac."authorityTier"::text = ANY($${nextParamIdx}::text[])` : ''
  if (tierParam) nextParamIdx++

  // Build superseded filter (no parameter — boolean literal)
  const supersededFilter = includeSuperseded ? '' : `AND ac."superseded" = false`

  // Build promotion layer filter
  const layerParam = promotionLayers && promotionLayers.length > 0 ? promotionLayers : null
  const layerFilter = layerParam ? `AND ac."promotionLayer"::text = ANY($${nextParamIdx}::text[])` : ''
  if (layerParam) nextParamIdx++

  // The query text for ts_rank is always the next parameter
  const queryParamIdx = nextParamIdx

  // Combine vector similarity and full-text ranking
  // The final score is 0.7 * cosine_similarity + 0.3 * ts_rank (normalized)
  const sql = `
    SELECT
      ac."id",
      ac."content",
      ac."citationString",
      ac."authorityTier"::text AS "authorityTier",
      ac."authorityStatus"::text AS "authorityStatus",
      ac."precedentialStatus"::text AS "precedentialStatus",
      ac."chunkType",
      ac."sourceUrl",
      ac."issueTags",
      (
        0.7 * (1 - (ac."embedding" <=> $1::vector)) +
        0.3 * COALESCE(
          ts_rank(
            to_tsvector('english', ac."content"),
            plainto_tsquery('english', $${queryParamIdx}::text)
          ),
          0
        )
      ) AS "similarityScore"
    FROM "authority_chunks" ac
    WHERE ac."authorityStatus"::text IN ('CURRENT', 'PROPOSED')
      AND ac."embedding" IS NOT NULL
      ${supersededFilter}
      ${tierFilter}
      ${layerFilter}
    ORDER BY "similarityScore" DESC
    LIMIT ${limit}
  `

  // Build parameter list based on which filters are active
  const params: unknown[] = [embeddingStr]                // $1
  if (tierParam) params.push(tierParam)                   // $2 (if present)
  if (layerParam) params.push(layerParam)                 // $2 or $3 (if present)
  params.push(query)                                      // last param for ts_rank

  try {
    const results = await prisma.$queryRawUnsafe<RetrievedChunk[]>(sql, ...params)

    // If we got results with promoted layers, great. If not and we had a layer
    // filter, retry without it to fall back to RAW.
    if (results.length === 0 && layerParam) {
      return hybridRetrieve({
        ...options,
        promotionLayers: undefined,
      })
    }

    return results
  } catch (error) {
    // If pgvector extension is not available or query fails, fall back to
    // a simpler full-text search
    console.error('[Retriever] Hybrid search failed, falling back to full-text:', error)
    return fullTextFallback(query, tiers, includeSuperseded, limit)
  }
}

/**
 * Fallback: full-text search only (no vector similarity).
 */
async function fullTextFallback(
  query: string,
  tiers: AuthorityTier[] | undefined,
  includeSuperseded: boolean,
  limit: number
): Promise<RetrievedChunk[]> {
  const tierFilter = tiers && tiers.length > 0
    ? `AND ac."authorityTier"::text = ANY($2::text[])`
    : ''
  const tierParam = tiers && tiers.length > 0 ? tiers : null

  const supersededFilter = includeSuperseded
    ? ''
    : `AND ac."superseded" = false`

  const sql = `
    SELECT
      ac."id",
      ac."content",
      ac."citationString",
      ac."authorityTier"::text AS "authorityTier",
      ac."authorityStatus"::text AS "authorityStatus",
      ac."precedentialStatus"::text AS "precedentialStatus",
      ac."chunkType",
      ac."sourceUrl",
      ac."issueTags",
      ts_rank(
        to_tsvector('english', ac."content"),
        plainto_tsquery('english', $1::text)
      ) AS "similarityScore"
    FROM "authority_chunks" ac
    WHERE ac."authorityStatus"::text IN ('CURRENT', 'PROPOSED')
      ${supersededFilter}
      ${tierFilter}
      AND to_tsvector('english', ac."content") @@ plainto_tsquery('english', $1::text)
    ORDER BY "similarityScore" DESC
    LIMIT ${limit}
  `

  const params: unknown[] = [query]
  if (tierParam) params.push(tierParam)

  try {
    return await prisma.$queryRawUnsafe<RetrievedChunk[]>(sql, ...params)
  } catch (error) {
    console.error('[Retriever] Full-text fallback also failed:', error)
    return []
  }
}
