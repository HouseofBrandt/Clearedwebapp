/**
 * Promote SourceArtifact rows into KnowledgeDocument rows so the full
 * authority corpus becomes findable via the existing `searchKnowledge`
 * retrieval path used by Banjo, Junebug, and Research.
 *
 * Why: Pippen's Stage 3 ingest writes a compiled summary into
 * `KnowledgeDocument`. The raw authoritative content (IRM sections,
 * Treas. Regs, Tax Court opinions, Rev. Procs) lives only in
 * `SourceArtifact` and never reaches retrieval. This bridge closes that
 * gap without rewiring any consumer — retrieval keeps calling
 * `searchKnowledge` (which queries `knowledge_chunks`), but that store
 * now contains the authorities themselves, not just summaries of them.
 *
 * Run after each daily-harvest cycle. Idempotent: re-running won't
 * duplicate documents for already-promoted artifacts.
 */

import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { classifyIssue } from "@/lib/tax-authority/retrieval/classifier"
import type { IssueCategory } from "@/lib/tax-authority/types"

/** Map each harvester's sourceId → the best-fit KnowledgeCategory. */
const SOURCE_ID_TO_CATEGORY: Record<string, string> = {
  irs_irm: "IRM_SECTION",
  treas_reg_cfr26: "TREASURY_REGULATION",
  ustc_opinions: "CASE_LAW",
  irs_irb: "REVENUE_PROCEDURE",
  // These have no clean enum match — CUSTOM keeps them searchable without
  // forcing a wrong category on them. Their `tags` still identify the source.
  irs_written_determinations: "CUSTOM",
  irs_news_releases: "CUSTOM",
  treasury_press: "CUSTOM",
  taxpayer_advocate: "CUSTOM",
  irs_forms_pubs: "CUSTOM",
}

/**
 * Cap for extracted text per artifact. Large enough to cover full IRM
 * sections and Tax Court opinions; small enough to prevent a single runaway
 * artifact from blowing out embeddings budget.
 */
const MAX_TEXT_BYTES = 500_000

/**
 * Minimum printable-character ratio for text to be worth chunking. Anything
 * below this is almost certainly binary (PDF bytes, image data, etc.) that
 * would pollute the chunk index with junk.
 */
const MIN_PRINTABLE_RATIO = 0.85

export interface PromotionResult {
  examined: number
  promoted: number
  skipped: { reason: string; count: number }[]
  failed: number
  errors: string[]
}

export async function promoteSourceArtifactsToKB(
  opts: { since?: Date; batchLimit?: number } = {}
): Promise<PromotionResult> {
  const result: PromotionResult = {
    examined: 0,
    promoted: 0,
    skipped: [],
    failed: 0,
    errors: [],
  }

  const skipReasons: Record<string, number> = {}
  const skip = (reason: string) => {
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
  }

  // Attribution: reuse the system user Pippen uses so the audit trail is
  // consistent across automated KB writes.
  const systemUser = await findSystemUser()
  if (!systemUser) {
    result.errors.push("No system user found for attribution")
    return result
  }

  // Skip artifacts that the harvester-side relevance gate flagged as
  // off-topic (parserStatus='SKIPPED'). Those rows still exist for the audit
  // trail but never reach retrieval. See BaseHarvester.storeArtifact for the
  // classifier decision logic.
  const artifacts = await prisma.sourceArtifact.findMany({
    where: {
      parserStatus: { notIn: ["SKIPPED", "FAILED"] },
      ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
    },
    select: {
      id: true,
      sourceId: true,
      normalizedTitle: true,
      publicationDate: true,
      effectiveDate: true,
      authorityTier: true,
      jurisdiction: true,
      rawContent: true,
      contentType: true,
      sourceUrl: true,
      metadata: true,
    },
    orderBy: { createdAt: "desc" },
    take: opts.batchLimit ?? 500,
  })

  result.examined = artifacts.length

  for (const artifact of artifacts) {
    try {
      // Skip — no raw bytes to promote (S3-only fetch not implemented yet)
      if (!artifact.rawContent) {
        skip("no_raw_content")
        continue
      }

      // Skip — binary or near-binary content (pdf bytes, image bytes, etc.)
      const text = decodeRawContent(artifact.rawContent, artifact.contentType)
      if (!text) {
        skip("binary_or_unreadable")
        continue
      }

      // Skip — too short to be useful (likely a stub or metadata-only artifact)
      if (text.length < 200) {
        skip("too_short")
        continue
      }

      // Idempotency — already promoted?
      const artifactTag = `artifact:${artifact.id}`
      const existing = await prisma.knowledgeDocument.findFirst({
        where: { tags: { has: artifactTag } },
        select: { id: true },
      })
      if (existing) {
        skip("already_promoted")
        continue
      }

      // Build metadata: tier + source + classified issue categories
      const category = SOURCE_ID_TO_CATEGORY[artifact.sourceId] ?? "CUSTOM"
      const rawCategories = await classifyIssue(artifact.normalizedTitle)
      const issueCategories = rawCategories.filter(
        (c): c is IssueCategory => c !== "mixed"
      )

      const tags = [
        "tax-authority",
        `source:${artifact.sourceId}`,
        `tier:${artifact.authorityTier}`,
        artifactTag,
        ...issueCategories.map((c) => `issue:${c}`),
        ...(artifact.jurisdiction ? [`jurisdiction:${artifact.jurisdiction}`] : []),
      ]

      const truncatedText = text.length > MAX_TEXT_BYTES
        ? text.slice(0, MAX_TEXT_BYTES)
        : text

      // Create the KnowledgeDocument with the FK back to source_artifacts
      // so retrieval can JOIN on qualityScore (Phase 3).
      const doc = await prisma.knowledgeDocument.create({
        data: {
          title: artifact.normalizedTitle,
          description: artifact.sourceUrl || `Tax authority artifact (${artifact.sourceId})`,
          category: category as any,
          sourceText: truncatedText,
          sourceType: "TAX_AUTHORITY",
          sourceArtifactId: artifact.id,
          tags,
          processingStatus: "processing",
          uploadedById: systemUser.id,
        },
      })

      // Chunk + embed using the same pipeline Pippen uses
      try {
        await ingestDocument(doc.id, truncatedText)
        await prisma.knowledgeDocument.update({
          where: { id: doc.id },
          data: { processingStatus: "ready" },
        })
      } catch (err: any) {
        // Even if embedding fails, leave the document with chunks for full-text
        // search. Mark processingStatus as "ready" anyway — chunks are usable.
        console.warn(
          `[Promote] ingestDocument failed for ${artifact.id}: ${err?.message}`
        )
        await prisma.knowledgeDocument.update({
          where: { id: doc.id },
          data: { processingStatus: "ready" },
        }).catch(() => {})
      }

      result.promoted++
    } catch (err: any) {
      result.failed++
      const msg = err?.message || String(err)
      // Keep only the first 10 errors to avoid a huge response payload
      if (result.errors.length < 10) {
        result.errors.push(`${artifact.id}: ${msg.slice(0, 200)}`)
      }
    }
  }

  result.skipped = Object.entries(skipReasons).map(([reason, count]) => ({
    reason,
    count,
  }))

  return result
}

/**
 * Decode SourceArtifact.rawContent (Bytes) into a string suitable for
 * chunking. Returns null if the content appears binary or unreadable.
 *
 * Applies a crude HTML strip when the content is HTML — preserves text
 * content and drops tags/scripts/styles without pulling in a full HTML
 * parser. Good enough for Phase 1; if we want fidelity later we can
 * swap in `cheerio` or `htmlparser2`.
 */
function decodeRawContent(
  rawContent: Uint8Array | Buffer,
  contentType: string | null | undefined
): string | null {
  // Convert to Buffer first so we can iterate bytes quickly
  const buf = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent)

  // Heuristic: if it starts with "%PDF" or the PNG/JPEG magic bytes, skip.
  if (buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return null // %PDF
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return null // PNG
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return null // JPEG
  }

  let text: string
  try {
    text = buf.toString("utf-8")
  } catch {
    return null
  }

  // Printable-ratio check — if less than ~85% of chars look like real text,
  // it's probably not a text payload we should be chunking.
  if (text.length === 0) return null
  let printable = 0
  const sampleSize = Math.min(text.length, 2000)
  for (let i = 0; i < sampleSize; i++) {
    const code = text.charCodeAt(i)
    // printable ASCII + common whitespace + most unicode ranges
    if ((code >= 32 && code < 127) || code === 9 || code === 10 || code === 13 || code >= 160) {
      printable++
    }
  }
  if (printable / sampleSize < MIN_PRINTABLE_RATIO) return null

  // HTML strip for text/html content. Keep it crude — no DOM parser.
  const isHtml = /html|xml/i.test(contentType ?? "") || /<html[\s>]/i.test(text.slice(0, 500))
  if (isHtml) {
    text = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s{2,}/g, " ")
      .trim()
  }

  return text.length >= 200 ? text : null
}

/**
 * Find a system user to attribute automated KB writes to. Mirrors the
 * pattern in `src/lib/pippen/ingest-learnings.ts` — duplicated inline to
 * avoid a new shared module and the circular-dep risk that would bring.
 */
async function findSystemUser(): Promise<{ id: string } | null> {
  try {
    const pippen = await prisma.user.findFirst({
      where: { name: { contains: "Pippen", mode: "insensitive" } },
      select: { id: true },
    })
    if (pippen) return pippen

    const systemUser = await prisma.user.findFirst({
      where: { role: "SYSTEM" as any },
      select: { id: true },
    })
    if (systemUser) return systemUser

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    })
    return admin
  } catch {
    return null
  }
}
