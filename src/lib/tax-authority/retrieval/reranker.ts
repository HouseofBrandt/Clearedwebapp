/**
 * Authority-weighted Reranker — applies the effective weight formula
 * to retrieved chunks and returns the top results.
 *
 * Effective weight = baseWeight + recency + jurisdiction + citation + benchmark - superseded - stale
 * Clamped: C1 ceiling = 0.60, all weights clamped to [0.0, 1.15]
 */

import type { RetrievedChunk } from './retriever'
import type { RankedChunk, ChunkMetadata, AuthorityTier } from '../types'
import { AUTHORITY_WEIGHTS, WEIGHT_MODIFIERS } from '../constants'

/**
 * Rerank retrieved chunks by applying authority weights and modifiers.
 *
 * @param chunks — raw retrieved chunks from hybrid search
 * @param options — optional context for bonus modifiers
 * @returns top 15 chunks sorted by effective weight descending
 */
export function rerankChunks(
  chunks: RetrievedChunk[],
  options?: {
    jurisdiction?: string
    queryCitations?: string[]
    benchmarkSuccesses?: Map<string, number>
  }
): RankedChunk[] {
  const now = Date.now()

  const ranked: RankedChunk[] = chunks.map((chunk) => {
    const tier = chunk.authorityTier as AuthorityTier
    let baseWeight = AUTHORITY_WEIGHTS[tier] ?? 0.5

    // ── Recency bonus ───────────────────────────────────────────────────
    // We don't have publicationDate on RetrievedChunk directly, so we
    // skip recency here. It can be added if the retriever returns dates.
    let recencyBonus = 0

    // ── Jurisdiction match bonus ────────────────────────────────────────
    let jurisdictionBonus = 0
    if (options?.jurisdiction) {
      // If the chunk's issue tags or content hint at the right jurisdiction
      // this is a simplistic match — full implementation would use a jurisdiction field
      jurisdictionBonus = 0 // Placeholder: would need chunk.jurisdiction field
    }

    // ── Exact citation hit bonus ────────────────────────────────────────
    let citationBonus = 0
    if (options?.queryCitations && options.queryCitations.length > 0) {
      const chunkCitation = chunk.citationString.toLowerCase()
      for (const qCitation of options.queryCitations) {
        if (chunkCitation.includes(qCitation.toLowerCase())) {
          citationBonus = WEIGHT_MODIFIERS.EXACT_CITATION_HIT
          break
        }
      }
    }

    // ── Benchmark success bonus ─────────────────────────────────────────
    let benchmarkBonus = 0
    if (options?.benchmarkSuccesses) {
      const successCount = options.benchmarkSuccesses.get(chunk.id) ?? 0
      benchmarkBonus = successCount * WEIGHT_MODIFIERS.BENCHMARK_SUCCESS
    }

    // ── Superseded penalty ──────────────────────────────────────────────
    // Chunks should already be filtered out, but apply penalty if present
    const supersededPenalty = 0 // Already filtered by retriever

    // ── Stale penalty ───────────────────────────────────────────────────
    const stalePenalty = 0 // Would need lastVerifiedAt from chunk

    // ── Compute effective weight ────────────────────────────────────────
    let effectiveWeight =
      baseWeight +
      recencyBonus +
      jurisdictionBonus +
      citationBonus +
      benchmarkBonus -
      supersededPenalty -
      stalePenalty

    // Apply C1 ceiling
    if (tier === 'C1') {
      effectiveWeight = Math.min(effectiveWeight, WEIGHT_MODIFIERS.PLR_CEILING)
    }

    // Clamp to [WEIGHT_FLOOR, WEIGHT_CEILING]
    effectiveWeight = Math.max(
      WEIGHT_MODIFIERS.WEIGHT_FLOOR,
      Math.min(WEIGHT_MODIFIERS.WEIGHT_CEILING, effectiveWeight)
    )

    // Combine effective weight with similarity score for final ranking
    // The similarity score is on [0, 1], so we multiply it by the weight
    const combinedScore = effectiveWeight * chunk.similarityScore

    const metadata: ChunkMetadata = {
      sourceType: chunk.chunkType,
      authorityTier: tier,
      authorityStatus: chunk.authorityStatus as ChunkMetadata['authorityStatus'],
      precedentialStatus: chunk.precedentialStatus as ChunkMetadata['precedentialStatus'],
      publicationDate: null,
      effectiveDate: null,
      citationString: chunk.citationString,
      parentCitation: null,
      jurisdiction: null,
      issueTags: chunk.issueTags ?? [],
      sourceUrl: chunk.sourceUrl ?? '',
      contentHash: '',
      superseded: false,
      chunkType: chunk.chunkType,
      tokenCount: 0,
    }

    return {
      chunkId: chunk.id,
      content: chunk.content,
      metadata,
      baseWeight,
      effectiveWeight: combinedScore,
      matchType: 'hybrid' as const,
      similarityScore: chunk.similarityScore,
    }
  })

  // Sort by effective weight descending
  ranked.sort((a, b) => b.effectiveWeight - a.effectiveWeight)

  // Return top 15
  return ranked.slice(0, 15)
}
