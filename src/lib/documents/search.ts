import { prisma } from "@/lib/db"
import { embedQuery } from "./chunking"

export interface DocumentSearchParams {
  caseId: string
  query: string
  fieldContext?: {
    fieldId: string
    fieldLabel: string
    expectedType: "currency" | "date" | "text" | "number" | "ssn" | "ein"
    formNumber: string
    sectionTitle: string
  }
  topK?: number
  documentCategories?: string[]
}

export interface DocumentSearchHit {
  documentId: string
  documentName: string
  documentCategory: string
  chunks: Array<{
    chunkId: string
    content: string
    pageNumber: number | null
    score: number
    vectorScore: number
    textScore: number
  }>
  extracts: Array<{
    extractType: string
    extractedData: any
    confidence: number
  }>
}

/**
 * Hybrid document search for form auto-population.
 *
 * Three retrievers run in parallel and merge results:
 *
 *   A. Vector similarity — pgvector cosine distance against chunk embeddings.
 *   B. Full-text search — Postgres to_tsvector over chunk content.
 *   C. Structured extracts — DocumentExtract rows (already-parsed fields).
 *
 * Results are grouped by document, ranked by merged score
 * (0.7 * vectorScore + 0.3 * textScore), and returned with their top
 * chunks + any relevant structured extracts.
 *
 * When embeddings are missing for a chunk (e.g. rate-limited during
 * chunking), vectorScore defaults to 0 and FTS carries the weight.
 */
export async function searchCaseDocuments(
  params: DocumentSearchParams
): Promise<DocumentSearchHit[]> {
  const topK = params.topK ?? 5
  const query = fieldAwareQuery(params)

  const [vectorHits, textHits] = await Promise.all([
    vectorSearch(params.caseId, query, topK * 2),
    fullTextSearch(params.caseId, params.query, topK * 2),
  ])

  // Merge hits by chunkId, summing weighted scores.
  const scoreByChunk = new Map<string, { vector: number; text: number; content: string; pageNumber: number | null; documentId: string }>()

  for (const hit of vectorHits) {
    scoreByChunk.set(hit.chunkId, {
      vector: hit.score,
      text: 0,
      content: hit.content,
      pageNumber: hit.pageNumber,
      documentId: hit.documentId,
    })
  }
  for (const hit of textHits) {
    const existing = scoreByChunk.get(hit.chunkId)
    if (existing) {
      existing.text = hit.score
    } else {
      scoreByChunk.set(hit.chunkId, {
        vector: 0,
        text: hit.score,
        content: hit.content,
        pageNumber: hit.pageNumber,
        documentId: hit.documentId,
      })
    }
  }

  // Group by document, compute merged score per chunk, keep top 2 chunks per doc.
  const byDocument = new Map<string, Array<{ chunkId: string; content: string; pageNumber: number | null; score: number; vector: number; text: number }>>()
  for (const [chunkId, s] of scoreByChunk) {
    const merged = 0.7 * s.vector + 0.3 * s.text
    const arr = byDocument.get(s.documentId) || []
    arr.push({ chunkId, content: s.content, pageNumber: s.pageNumber, score: merged, vector: s.vector, text: s.text })
    byDocument.set(s.documentId, arr)
  }

  // Fetch document metadata and extracts for the matched docs in one query.
  const documentIds = Array.from(byDocument.keys())
  if (documentIds.length === 0) {
    // Still return extracts-only matches if any exist for this case.
    return await extractsOnlyHits(params.caseId)
  }

  const [documents, extracts] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, fileName: true, documentCategory: true },
    }),
    prisma.documentExtract.findMany({
      where: { documentId: { in: documentIds } },
      select: { documentId: true, extractType: true, extractedData: true, confidence: true },
    }),
  ])

  const docMap = new Map(documents.map((d) => [d.id, d]))
  const extractsByDoc = new Map<string, typeof extracts>()
  for (const e of extracts) {
    const arr = extractsByDoc.get(e.documentId) || []
    arr.push(e)
    extractsByDoc.set(e.documentId, arr)
  }

  const results: DocumentSearchHit[] = []
  for (const [docId, chunks] of byDocument) {
    const doc = docMap.get(docId)
    if (!doc) continue
    const topChunks = chunks.sort((a, b) => b.score - a.score).slice(0, 2)
    results.push({
      documentId: doc.id,
      documentName: doc.fileName,
      documentCategory: String(doc.documentCategory),
      chunks: topChunks.map((c) => ({
        chunkId: c.chunkId,
        content: c.content,
        pageNumber: c.pageNumber,
        score: c.score,
        vectorScore: c.vector,
        textScore: c.text,
      })),
      extracts: (extractsByDoc.get(docId) || []).map((e) => ({
        extractType: e.extractType,
        extractedData: e.extractedData,
        confidence: e.confidence,
      })),
    })
  }

  return results.sort((a, b) => {
    const aTop = a.chunks[0]?.score || 0
    const bTop = b.chunks[0]?.score || 0
    return bTop - aTop
  }).slice(0, topK)
}

// ── retriever A: vector search ───────────────────────────────────────────────

interface ChunkHit {
  chunkId: string
  documentId: string
  content: string
  pageNumber: number | null
  score: number
}

async function vectorSearch(caseId: string, query: string, limit: number): Promise<ChunkHit[]> {
  let embedding: number[]
  try {
    embedding = await embedQuery(query)
  } catch (err: any) {
    console.warn("[documents/search] vector embedding failed — falling back to FTS only", { error: err?.message })
    return []
  }

  const literal = `[${embedding.join(",")}]`
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string
    document_id: string
    content: string
    page_number: number | null
    similarity: number
  }>>(
    `SELECT c.id, c."documentId" AS document_id, c.content, c."pageNumber" AS page_number,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM document_chunks c
     JOIN documents d ON d.id = c."documentId"
     WHERE d."caseId" = $2
       AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    literal,
    caseId,
    limit,
  )

  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    content: r.content,
    pageNumber: r.page_number,
    score: Math.max(0, Math.min(1, Number(r.similarity) || 0)),
  }))
}

// ── retriever B: full-text search ────────────────────────────────────────────

async function fullTextSearch(caseId: string, query: string, limit: number): Promise<ChunkHit[]> {
  // tsquery-escape the query string. Reduce to whitespace-separated words and
  // quote/escape each token. We use prefix matching via :* for flexibility.
  const tokens = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 10)
  if (tokens.length === 0) return []
  const tsquery = tokens.map((t) => `${t}:*`).join(" & ")

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string
      document_id: string
      content: string
      page_number: number | null
      rank: number
    }>>(
      `SELECT c.id, c."documentId" AS document_id, c.content, c."pageNumber" AS page_number,
              ts_rank(to_tsvector('english', c.content), to_tsquery('english', $1)) AS rank
       FROM document_chunks c
       JOIN documents d ON d.id = c."documentId"
       WHERE d."caseId" = $2
         AND to_tsvector('english', c.content) @@ to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $3`,
      tsquery,
      caseId,
      limit,
    )
    // Normalize rank to [0, 1] — ts_rank returns unbounded values.
    const maxRank = rows.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0)
    const norm = maxRank > 0 ? 1 / maxRank : 0
    return rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      pageNumber: r.page_number,
      score: (Number(r.rank) || 0) * norm,
    }))
  } catch (err: any) {
    console.warn("[documents/search] FTS failed", { error: err?.message, tsquery })
    return []
  }
}

// ── retriever C: extracts-only fallback ──────────────────────────────────────

async function extractsOnlyHits(caseId: string): Promise<DocumentSearchHit[]> {
  const docs = await prisma.document.findMany({
    where: { caseId },
    select: { id: true, fileName: true, documentCategory: true, extracts: true },
  })
  const hits: DocumentSearchHit[] = []
  for (const d of docs) {
    if (d.extracts.length === 0) continue
    hits.push({
      documentId: d.id,
      documentName: d.fileName,
      documentCategory: String(d.documentCategory),
      chunks: [],
      extracts: d.extracts.map((e) => ({
        extractType: e.extractType,
        extractedData: e.extractedData,
        confidence: e.confidence,
      })),
    })
  }
  return hits
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fieldAwareQuery(params: DocumentSearchParams): string {
  if (!params.fieldContext) return params.query
  // Augment the query with the field label and form context so the embedding
  // picks up semantic signals beyond the raw query.
  return `${params.query} · ${params.fieldContext.fieldLabel} · ${params.fieldContext.formNumber} ${params.fieldContext.sectionTitle}`
}
