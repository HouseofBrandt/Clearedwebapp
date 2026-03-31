import { generateEmbedding } from "./embeddings"
import { ensureVectorColumn } from "./vector-setup"
import { prisma } from "@/lib/db"
import { trackError } from "@/lib/error-tracking"
import * as Sentry from "@sentry/nextjs"

export interface SearchResult {
  chunkId: string
  content: string
  sectionHeader: string | null
  documentId: string
  documentTitle: string
  documentCategory: string
  tags: string[]
  score: number
  vectorScore: number
  textScore: number
}

export async function searchKnowledge(
  query: string,
  options: {
    topK?: number
    categoryFilter?: string[]
    tagFilter?: string[]
    minScore?: number
  } = {}
): Promise<SearchResult[]> {
  const { topK = 10, categoryFilter, tagFilter, minScore = 0.2 } = options

  if (!query.trim()) return []

  // Ensure pgvector extension and embedding column exist
  await ensureVectorColumn()

  // 1. Generate query embedding
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await generateEmbedding(query)
  } catch {
    // Fall back to text-only search
  }

  // 2. Build tsquery for full-text search
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[^a-zA-Z0-9§.]/g, ""))
    .filter(Boolean)
  const tsQuery = words.length > 0 ? words.map((w) => `${w}:*`).join(" | ") : null

  // 3. Build hybrid query
  let sql: string
  const params: any[] = []
  let paramIndex = 1

  if (queryEmbedding && tsQuery) {
    const embeddingStr = `[${queryEmbedding.join(",")}]`
    sql = `
      SELECT
        kc.id as "chunkId", kc.content, kc."sectionHeader",
        kd.id as "documentId", kd.title as "documentTitle",
        kd.category as "documentCategory", kd.tags, kd."sourceType",
        CASE WHEN kc.embedding IS NOT NULL
          THEN 1 - (kc.embedding <=> $${paramIndex}::vector) ELSE 0 END as "vectorScore",
        CASE WHEN kc.search_vector @@ to_tsquery('english', $${paramIndex + 1})
          THEN ts_rank_cd(kc.search_vector, to_tsquery('english', $${paramIndex + 1}), 32) ELSE 0 END as "textScore",
        (
          COALESCE(CASE WHEN kc.embedding IS NOT NULL
            THEN (1 - (kc.embedding <=> $${paramIndex}::vector)) * 0.7 ELSE 0 END, 0) +
          COALESCE(CASE WHEN kc.search_vector @@ to_tsquery('english', $${paramIndex + 1})
            THEN ts_rank_cd(kc.search_vector, to_tsquery('english', $${paramIndex + 1}), 32) * 0.3 ELSE 0 END, 0)
        ) as score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc."documentId"
      WHERE kd."isActive" = true
        AND (
          (kc.embedding IS NOT NULL AND 1 - (kc.embedding <=> $${paramIndex}::vector) > 0.25)
          OR (kc.search_vector @@ to_tsquery('english', $${paramIndex + 1}))
        )
    `
    params.push(embeddingStr, tsQuery)
    paramIndex += 2
  } else if (queryEmbedding) {
    const embeddingStr = `[${queryEmbedding.join(",")}]`
    sql = `
      SELECT
        kc.id as "chunkId", kc.content, kc."sectionHeader",
        kd.id as "documentId", kd.title as "documentTitle",
        kd.category as "documentCategory", kd.tags, kd."sourceType",
        CASE WHEN kc.embedding IS NOT NULL
          THEN 1 - (kc.embedding <=> $${paramIndex}::vector) ELSE 0 END as "vectorScore",
        0::float as "textScore",
        CASE WHEN kc.embedding IS NOT NULL
          THEN 1 - (kc.embedding <=> $${paramIndex}::vector) ELSE 0 END as score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc."documentId"
      WHERE kd."isActive" = true
        AND kc.embedding IS NOT NULL
        AND 1 - (kc.embedding <=> $${paramIndex}::vector) > 0.25
    `
    params.push(embeddingStr)
    paramIndex++
  } else if (tsQuery) {
    sql = `
      SELECT
        kc.id as "chunkId", kc.content, kc."sectionHeader",
        kd.id as "documentId", kd.title as "documentTitle",
        kd.category as "documentCategory", kd.tags, kd."sourceType",
        0::float as "vectorScore",
        ts_rank_cd(kc.search_vector, to_tsquery('english', $${paramIndex}), 32) as "textScore",
        ts_rank_cd(kc.search_vector, to_tsquery('english', $${paramIndex}), 32) as score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc."documentId"
      WHERE kd."isActive" = true
        AND kc.search_vector @@ to_tsquery('english', $${paramIndex})
    `
    params.push(tsQuery)
    paramIndex++
  } else {
    return []
  }

  if (categoryFilter && categoryFilter.length > 0) {
    sql += ` AND kd.category::text = ANY($${paramIndex}::text[])`
    params.push(categoryFilter)
    paramIndex++
  }

  if (tagFilter && tagFilter.length > 0) {
    sql += ` AND kd.tags && $${paramIndex}::text[]`
    params.push(tagFilter)
    paramIndex++
  }

  sql += ` ORDER BY score DESC LIMIT ${topK}`

  let results: SearchResult[] = []
  try {
    results = (await prisma.$queryRawUnsafe(sql, ...params)) as SearchResult[]
  } catch (err: any) {
    console.error("[Knowledge Search] Raw query failed:", err.message)
    Sentry.captureException(err, { tags: { route: "knowledge/search" } })
    trackError({
      route: "knowledge/search",
      error: err,
      metadata: { queryLength: query.length },
    }).catch(() => {})
    return []
  }
  // Apply authority-weighted scoring based on source type
  const AUTHORITY_WEIGHTS: Record<string, number> = {
    MANUAL_UPLOAD: 1.0,
    APPROVED_OUTPUT: 0.95,
    JUNEBUG_CURATED: 0.85,
    WEB_RESEARCH: 0.75,
    AUTO_ENRICHMENT: 0.65,
  }

  for (const r of results) {
    const weight = AUTHORITY_WEIGHTS[(r as any).sourceType] || 0.8
    r.score *= weight
  }

  const filtered = results.filter((r) => r.score >= minScore)

  // Fire-and-forget hit counter + lastReferencedAt updates
  if (filtered.length > 0) {
    const chunkIds = filtered.map((r) => r.chunkId)
    const docIds = Array.from(new Set(filtered.map((r) => r.documentId)))

    prisma
      .$executeRawUnsafe(
        `UPDATE knowledge_chunks SET "hitCount" = "hitCount" + 1 WHERE id = ANY($1::text[])`,
        chunkIds
      )
      .catch(() => {})
    prisma.knowledgeDocument
      .updateMany({
        where: { id: { in: docIds } },
        data: { hitCount: { increment: 1 }, lastReferencedAt: new Date() },
      })
      .catch(() => {})
  }

  return filtered
}
