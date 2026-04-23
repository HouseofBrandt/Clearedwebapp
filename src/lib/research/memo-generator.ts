/**
 * Two-pass memo generator (spec §7.2).
 *
 *   Pass 1 — Draft.
 *     Claude produces a structured MemoDraft. The draft pass has access
 *     to verify_citation + web_search; the system prompt requires it to
 *     verify every authority BEFORE asserting a holding.
 *
 *   Pass 2 — Verify.
 *     Deterministic pass. For every citation in the draft that lacks a
 *     verification record, run verify_citation now and attach the result.
 *     This catches cases where the draft emitted a citation without
 *     actually calling the tool (lazy model behavior).
 *
 *   Pass 2b (conditional) — Revise.
 *     If any citation came back not_found / unverifiable, invoke Claude
 *     ONCE more with the verified draft + flagged list and ask for a
 *     revision that either drops the claim or cites a verified alternative.
 *     Single pass, no infinite loop.
 *
 *   Pass 3 — Render.
 *     renderMemo(draft) → Buffer. Pure function, no Claude.
 *
 * The entry point returns both the final buffer AND the draft object so
 * callers can inspect the structure (e.g., to log citation verification
 * stats, store the draft for audit, or return metadata alongside the
 * docx).
 */

import Anthropic from "@anthropic-ai/sdk"
import { buildMessagesRequest } from "@/lib/ai/model-capabilities"
import { preferredOpusModel } from "@/lib/ai/model-selection"
import {
  VERIFY_CITATION_TOOL,
  verifyCitation,
  type VerificationResult,
} from "./citation-verifier"
import { MEMO_SYSTEM_PROMPT } from "./memo-system-prompt"
import { renderMemo } from "@/lib/memo-renderer/renderer"
import type { MemoDraft, MemoCitation } from "@/lib/memo-renderer/types"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

export type MemoProgressEvent =
  | { kind: "phase"; phase: "drafting" | "verifying" | "revising" | "rendering" | "complete"; headline: string; percent: number }
  | { kind: "verify_citation"; citation: string; status: "started" | "verified" | "not_found" | "superseded" | "unverifiable" }
  | { kind: "detail"; detail: string }
  | { kind: "revise_flagged"; count: number }

export interface GenerateMemoRequest {
  /**
   * Practitioner's request text. The model distills this into Facts +
   * Questions Presented; do not pre-structure.
   */
  prompt: string
  /** Optional header fields the caller knows — else placeholders. */
  header?: {
    to?: string
    from?: string
    cc?: string
    re?: string
    date?: string
    letterhead?: string
  }
  /** Optional additional context (case facts, prior research output). */
  context?: string
  /** Override default body-of-law phrasing. Default: "federal tax law". */
  bodyOfLaw?: string
  /** Progress listener. Route forwards to SSE. */
  onProgress?: (event: MemoProgressEvent) => void
}

export interface GenerateMemoResult {
  /** Docx bytes. */
  buffer: Buffer
  /** Final verified MemoDraft (post-verify, post-revise). */
  draft: MemoDraft
  /** Verification stats for logging + reviewer UI. */
  verification: {
    total: number
    verified: number
    notFound: number
    superseded: number
    unverifiable: number
  }
  /** Raw model response text from pass 1 (for debug/audit). */
  draftRaw: string
}

const MAX_TOOL_TURNS = 8

/**
 * Orchestrate draft → verify → render. Throws only on catastrophic
 * failure (Claude 4xx/5xx, invalid JSON after one retry). All citation-
 * verification issues are surfaced in the result.verification stats.
 */
export async function generateMemo(
  req: GenerateMemoRequest
): Promise<GenerateMemoResult> {
  const model = preferredOpusModel()
  const emit = (e: MemoProgressEvent) => { try { req.onProgress?.(e) } catch {} }

  // ── Pass 1: Draft ──────────────────────────────────────────────────

  emit({ kind: "phase", phase: "drafting", headline: "Drafting the memo", percent: 10 })

  const userMessage = buildUserMessage(req)
  const messages: any[] = [{ role: "user", content: userMessage }]
  const citationsCollectedDuringDraft: VerificationResult[] = []

  let response: any
  let turns = 0
  while (true) {
    response = await anthropic.messages.create(
      buildMessagesRequest({
        model,
        max_tokens: 16384,
        system: MEMO_SYSTEM_PROMPT,
        tools: [
          { type: "web_search_20250305", name: "web_search" },
          VERIFY_CITATION_TOOL,
        ],
        messages,
        effort: "xhigh",
      })
    )
    messages.push({ role: "assistant", content: response.content })
    if (response.stop_reason !== "tool_use") break

    const verifyCalls = response.content.filter(
      (b: any) => b.type === "tool_use" && b.name === VERIFY_CITATION_TOOL.name
    )
    if (verifyCalls.length === 0) {
      emit({ kind: "detail", detail: "Reading web-search results" })
      if (++turns >= MAX_TOOL_TURNS) break
      continue
    }

    emit({ kind: "detail", detail: `Verifying ${verifyCalls.length} citation${verifyCalls.length === 1 ? "" : "s"}` })

    const results = await Promise.all(
      verifyCalls.map(async (tu: any) => {
        const input = tu.input as { citation: string }
        emit({ kind: "verify_citation", citation: input.citation, status: "started" })
        const v = await verifyCitation(input.citation)
        citationsCollectedDuringDraft.push(v)
        emit({ kind: "verify_citation", citation: input.citation, status: v.status })
        return {
          tool_use_id: tu.id,
          payload: {
            citation: v.raw,
            status: v.status,
            verified_title: v.verifiedTitle,
            court_or_agency: v.courtOrAgency,
            year: v.year,
            summary: v.summary,
            source_url: v.sourceUrl,
            superseded_by: v.supersededBy,
            note: v.note,
            source_of_truth: v.sourceOfTruth,
          },
        }
      })
    )
    messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.tool_use_id,
        content: JSON.stringify(r.payload),
      })),
    })
    if (++turns >= MAX_TOOL_TURNS) break
  }

  const draftRaw = extractTextFromResponse(response)
  let draft = parseDraftJson(draftRaw)
  draft = applyHeaderDefaults(draft, req)

  // ── Pass 2: Verify every citation (backfill + attach verdicts) ─────

  emit({ kind: "phase", phase: "verifying", headline: "Verifying every citation", percent: 65 })

  const byRaw = new Map<string, VerificationResult>()
  for (const v of citationsCollectedDuringDraft) byRaw.set(v.raw, v)

  const needsBackfill: MemoCitation[] = []
  for (const c of draft.citations) {
    const cached = byRaw.get(c.fullCitation)
    if (cached) {
      c.verification = {
        status: cached.status,
        sourceUrl: cached.sourceUrl,
        verifiedTitle: cached.verifiedTitle,
        note: cached.note,
      }
    } else {
      needsBackfill.push(c)
    }
  }

  if (needsBackfill.length > 0) {
    emit({ kind: "detail", detail: `Backfilling ${needsBackfill.length} citation${needsBackfill.length === 1 ? "" : "s"} the draft skipped` })
    const backfilled = await Promise.all(
      needsBackfill.map((c) => verifyCitation(c.fullCitation))
    )
    needsBackfill.forEach((c, i) => {
      const v = backfilled[i]
      c.verification = {
        status: v.status,
        sourceUrl: v.sourceUrl,
        verifiedTitle: v.verifiedTitle,
        note: v.note,
      }
    })
  }

  // ── Pass 2b: Revise if any unverified citations remain ─────────────

  const unverified = draft.citations.filter(
    (c) => c.verification?.status === "not_found" || c.verification?.status === "unverifiable"
  )

  if (unverified.length > 0) {
    emit({ kind: "phase", phase: "revising", headline: `Revising draft — ${unverified.length} unverified citation${unverified.length === 1 ? "" : "s"}`, percent: 80 })
    emit({ kind: "revise_flagged", count: unverified.length })
    draft = await reviseUnverified(draft, unverified)
  }

  // ── Pass 3: Render ─────────────────────────────────────────────────

  emit({ kind: "phase", phase: "rendering", headline: "Rendering the .docx", percent: 95 })
  const buffer = await renderMemo(draft)
  emit({ kind: "phase", phase: "complete", headline: "Memo ready", percent: 100 })

  return {
    buffer,
    draft,
    verification: countByStatus(draft.citations),
    draftRaw,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildUserMessage(req: GenerateMemoRequest): string {
  const parts: string[] = []
  parts.push(`Research topic / prompt:\n${req.prompt}`)
  if (req.context && req.context.trim()) {
    parts.push(`\n\nAdditional context:\n${req.context}`)
  }
  if (req.header) {
    const h = req.header
    const meta: string[] = []
    if (h.to) meta.push(`To: ${h.to}`)
    if (h.from) meta.push(`From: ${h.from}`)
    if (h.re) meta.push(`Re: ${h.re}`)
    if (h.date) meta.push(`Date: ${h.date}`)
    if (meta.length > 0) {
      parts.push(`\n\nHeader fields supplied by the user:\n${meta.join("\n")}`)
    }
  }
  if (req.bodyOfLaw) {
    parts.push(`\n\nBody of law for the closing disclaimer: "${req.bodyOfLaw}".`)
  }
  parts.push(
    `\n\nProduce the memo as a single JSON object matching the schema in the system prompt. No prose or markdown — JSON only.`
  )
  return parts.join("")
}

function extractTextFromResponse(response: any): string {
  return response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n\n")
    .trim()
}

/** Strip markdown fences if the model included them, then JSON.parse. */
function parseDraftJson(raw: string): MemoDraft {
  const trimmed = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
  // Most robust: find first '{' and last '}' and parse that slice.
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first === -1 || last === -1 || last < first) {
    throw new Error("[memo-generator] draft did not contain a JSON object")
  }
  const slice = trimmed.slice(first, last + 1)
  try {
    return JSON.parse(slice) as MemoDraft
  } catch (err: any) {
    throw new Error(
      `[memo-generator] draft JSON parse failed: ${err?.message || err}. First 200 chars: ${slice.slice(0, 200)}`
    )
  }
}

function applyHeaderDefaults(draft: MemoDraft, req: GenerateMemoRequest): MemoDraft {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  return {
    ...draft,
    header: {
      ...draft.header,
      to: draft.header.to || req.header?.to,
      from: draft.header.from || req.header?.from,
      cc: draft.header.cc || req.header?.cc,
      re: draft.header.re || req.header?.re || "Research Memorandum",
      date: draft.header.date || req.header?.date || today,
      letterhead: draft.header.letterhead || req.header?.letterhead,
    },
    bodyOfLaw: draft.bodyOfLaw || req.bodyOfLaw || "federal tax law",
  }
}

/**
 * Single revision pass — ask Claude to fix the draft so no unverified
 * citation appears in the final memo. Either removes the claim or
 * substitutes a verified authority (which must itself pass verify_citation).
 * Returns a new draft; caller re-runs verification.
 */
async function reviseUnverified(
  draft: MemoDraft,
  unverified: MemoCitation[]
): Promise<MemoDraft> {
  const flaggedList = unverified
    .map((c) => `  - ${c.id}: ${c.fullCitation} (status: ${c.verification?.status || "unknown"})`)
    .join("\n")

  const userMessage = `The following citations in the draft below failed verification:

${flaggedList}

Revise the draft so that NO unverified citation appears in the final output. For each flagged citation, either:
  (a) REMOVE the citation and the sentence(s) that depended on it, or
  (b) REPLACE it with a verified alternative authority that supports the same proposition (call verify_citation on the replacement BEFORE writing it into the JSON).

Return the revised memo as a single JSON object matching the same schema. No prose, no markdown fences. Every citation in the revised \`citations\` array must have been verified.

CURRENT DRAFT:
${JSON.stringify(draft, null, 2)}`

  const messages: any[] = [{ role: "user", content: userMessage }]
  let response: any
  let turns = 0
  while (true) {
    response = await anthropic.messages.create(
      buildMessagesRequest({
        model: preferredOpusModel(),
        max_tokens: 16384,
        system: MEMO_SYSTEM_PROMPT,
        tools: [
          { type: "web_search_20250305", name: "web_search" },
          VERIFY_CITATION_TOOL,
        ],
        messages,
        effort: "xhigh",
      })
    )
    messages.push({ role: "assistant", content: response.content })
    if (response.stop_reason !== "tool_use") break

    const verifyCalls = response.content.filter(
      (b: any) => b.type === "tool_use" && b.name === VERIFY_CITATION_TOOL.name
    )
    if (verifyCalls.length === 0) {
      if (++turns >= MAX_TOOL_TURNS) break
      continue
    }

    const results = await Promise.all(
      verifyCalls.map(async (tu: any) => {
        const v = await verifyCitation((tu.input as { citation: string }).citation)
        return {
          tool_use_id: tu.id,
          payload: {
            citation: v.raw,
            status: v.status,
            verified_title: v.verifiedTitle,
            year: v.year,
            summary: v.summary,
            source_url: v.sourceUrl,
            note: v.note,
            source_of_truth: v.sourceOfTruth,
          },
        }
      })
    )
    messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.tool_use_id,
        content: JSON.stringify(r.payload),
      })),
    })
    if (++turns >= MAX_TOOL_TURNS) break
  }

  const revisedRaw = extractTextFromResponse(response)
  const revised = parseDraftJson(revisedRaw)
  return applyHeaderDefaults(revised, {
    prompt: "",
    header: draft.header,
    bodyOfLaw: draft.bodyOfLaw,
  })
}

function countByStatus(citations: MemoCitation[]) {
  let total = 0
  let verified = 0
  let notFound = 0
  let superseded = 0
  let unverifiable = 0
  for (const c of citations) {
    total++
    switch (c.verification?.status) {
      case "verified": verified++; break
      case "not_found": notFound++; break
      case "superseded": superseded++; break
      case "unverifiable": unverifiable++; break
      default: unverifiable++; break // no verification record = treat as unverifiable
    }
  }
  return { total, verified, notFound, superseded, unverifiable }
}
