/**
 * Citation verifier — the "ORM for citations" described in the spec.
 *
 * Given a raw citation string the model emitted, this returns a structured
 * VerificationResult that the model can use to correct itself before
 * stating a holding from memory.
 *
 * Resolution order:
 *   1. `CanonicalAuthority` table (firm's own harvested authority DB —
 *      always fastest, always highest signal). Covers IRM, Treas. Reg.,
 *      Rev. Proc., Rev. Rul., Notice, PLR, Tax Court opinions that the
 *      Pippen harvesters have picked up.
 *   2. CourtListener (federal case law — Tax Court, district, appellate,
 *      Supreme Court). Covers cases the harvesters haven't reached yet.
 *   3. Return `not_found` with a clear note so the model either drops
 *      the citation or flags it as unverified.
 *
 * This function is exposed as a tool to Claude during conductResearch.
 * The tool schema is defined at the bottom for use with Anthropic's
 * `tools` parameter.
 */

import { prisma } from "@/lib/db"
import { parseCitation, type ParsedCitation } from "./citation-normalizer"
import { searchByCitation, searchByName } from "./courtlistener-client"

export type VerificationStatus =
  | "verified"      // Found in an authoritative source; citation is real + holding is as stated
  | "superseded"    // Real citation but superseded by a newer authority
  | "not_found"     // Could not confirm citation exists
  | "unverifiable"  // Could not reach any verification source (all failed)

export interface VerificationResult {
  raw: string
  status: VerificationStatus
  /** Canonical/verified title when found ("Renkemeyer, Campbell & Weaver, LLP v. Commissioner"). */
  verifiedTitle?: string
  /** Court or issuing agency ("U.S. Tax Court", "IRS", "Treasury"). */
  courtOrAgency?: string
  /** Year of decision/issuance when known. */
  year?: number
  /** Short description of disposition/holding/subject matter. SOURCED from
   *  the authoritative system — never fabricated. */
  summary?: string
  /** Source URL for the practitioner to click through. */
  sourceUrl?: string
  /** If superseded: the citation that replaced this one. */
  supersededBy?: string
  /** Freeform note — especially useful for "found but no summary available;
   *  check the URL" scenarios. */
  note?: string
  /** Where the verification came from. Surfaced for transparency. */
  sourceOfTruth: "canonical_authority" | "courtlistener" | "none"
}

// ── Public API ──────────────────────────────────────────────────────

export async function verifyCitation(raw: string): Promise<VerificationResult> {
  const parsed = parseCitation(raw)

  // First try the firm's own authority database.
  const canonical = await tryCanonicalAuthority(parsed)
  if (canonical) return canonical

  // For case law (Tax Court + federal courts), try CourtListener.
  if (parsed.kind === "tc_regular" || parsed.kind === "tc_memo" || parsed.kind === "federal_case") {
    const cl = await tryCourtListener(parsed)
    if (cl) return cl
  }

  // Nothing found. Return not_found — model is instructed to drop or flag.
  return {
    raw,
    status: "not_found",
    sourceOfTruth: "none",
    note: parsed.kind === "unknown"
      ? "Citation format not recognized. If this is a real authority, provide it in a standard reporter format."
      : "Citation not found in the firm's authority database or CourtListener. Do NOT describe a holding from memory.",
  }
}

// ── CanonicalAuthority lookup ───────────────────────────────────────

async function tryCanonicalAuthority(parsed: ParsedCitation): Promise<VerificationResult | null> {
  if (!parsed.normalized) return null

  try {
    const row = await prisma.canonicalAuthority.findFirst({
      where: {
        OR: [
          { normalizedCitation: parsed.normalized },
          { citationString: parsed.raw },
        ],
      },
      select: {
        citationString: true,
        title: true,
        authorityStatus: true,
        authorityTier: true,
        precedentialStatus: true,
        effectiveDate: true,
        publicationDate: true,
        jurisdiction: true,
        supersededBy: { select: { citationString: true, title: true } },
        artifact: { select: { sourceUrl: true } },
      },
    })
    if (!row) return null

    const year = yearOf(row.effectiveDate || row.publicationDate)
    const isSuperseded =
      row.authorityStatus === "SUPERSEDED" || !!row.supersededBy
    return {
      raw: parsed.raw,
      status: isSuperseded ? "superseded" : "verified",
      verifiedTitle: row.title,
      courtOrAgency: courtFromTier(String(row.authorityTier), row.jurisdiction),
      year,
      summary: undefined, // Canonical table doesn't store holding summaries directly.
      sourceUrl: row.artifact?.sourceUrl || undefined,
      supersededBy: row.supersededBy?.citationString,
      note: isSuperseded
        ? `This authority has been superseded${row.supersededBy?.citationString ? ` by ${row.supersededBy.citationString}` : ""}. Do NOT rely on it for current practice.`
        : `Found in firm authority database (tier ${row.authorityTier}, status ${row.authorityStatus}, precedent ${row.precedentialStatus}).`,
      sourceOfTruth: "canonical_authority",
    }
  } catch (err: any) {
    console.warn("[citation-verifier] CanonicalAuthority lookup failed", {
      error: err?.message,
      raw: parsed.raw,
    })
    return null
  }
}

// ── CourtListener lookup ────────────────────────────────────────────

/**
 * Three outcomes here — NOT two. Be careful with the semantics:
 *
 *   - A VerificationResult with status="verified": CourtListener has it,
 *     the memo can describe the holding.
 *   - A VerificationResult with status="unverifiable": CourtListener was
 *     unreachable (403/auth/rate-limit/5xx). Claude must flag the cite
 *     as [UNVERIFIED] rather than drop it — the case may well be real.
 *   - null: CourtListener responded cleanly and found nothing. Upstream
 *     combines this with "not in canonical DB either" to produce
 *     status="not_found" (Claude drops).
 *
 * Do not collapse "unreachable" into null. That was the bug where real
 * Supreme Court + Tax Court cases were being marked not_found and
 * silently dropped from memos.
 */
async function tryCourtListener(parsed: ParsedCitation): Promise<VerificationResult | null> {
  // Try citation lookup first (most specific).
  const byCitation = await searchByCitation(parsed.raw)
  if (byCitation.kind === "hit") {
    const op = byCitation.opinion
    return {
      raw: parsed.raw,
      status: "verified",
      verifiedTitle: op.caseName,
      courtOrAgency: op.court,
      year: op.year ?? parsed.year,
      summary: op.summary,
      sourceUrl: op.absoluteUrl || undefined,
      note: "Verified via CourtListener. Confirm holding at the source URL before relying.",
      sourceOfTruth: "courtlistener",
    }
  }

  // If the first lookup was unreachable, the party-name search will
  // almost certainly fail the same way. Return "unverifiable" now so
  // Claude flags the citation instead of dropping it.
  if (byCitation.kind === "unreachable") {
    return buildUnverifiable(parsed, byCitation.reason, byCitation.status)
  }

  // Fall back to party-name search when the raw citation included one.
  if (parsed.partyName) {
    const byName = await searchByName(parsed.partyName, parsed.year)
    if (byName.kind === "hit") {
      const op = byName.opinion
      return {
        raw: parsed.raw,
        status: "verified",
        verifiedTitle: op.caseName,
        courtOrAgency: op.court,
        year: op.year ?? parsed.year,
        summary: op.summary,
        sourceUrl: op.absoluteUrl || undefined,
        note:
          "Verified via CourtListener name search — citation lookup failed but a case with this party name exists. Confirm the reporter/page numbers match.",
        sourceOfTruth: "courtlistener",
      }
    }
    if (byName.kind === "unreachable") {
      return buildUnverifiable(parsed, byName.reason, byName.status)
    }
  }

  // Clean miss: CourtListener responded and returned no results.
  return null
}

function buildUnverifiable(
  parsed: ParsedCitation,
  reason: string,
  status: number | undefined
): VerificationResult {
  const human =
    reason === "auth_required"
      ? "CourtListener returned 403 (auth required). This does NOT mean the citation is fabricated — the verifier just couldn't check. Set COURTLISTENER_TOKEN (free) to avoid this."
      : reason === "rate_limited"
        ? "CourtListener rate-limited the verifier. Retry later or set COURTLISTENER_TOKEN to raise the limit."
        : reason === "network_error"
          ? "Network error reaching CourtListener. The citation may still be valid."
          : `CourtListener unreachable (${reason}${status ? ", HTTP " + status : ""}). Verify manually before relying on this citation.`
  return {
    raw: parsed.raw,
    status: "unverifiable",
    year: parsed.year,
    note: human,
    sourceOfTruth: "none",
  }
}

// ── Anthropic tool schema ──────────────────────────────────────────

/**
 * Tool definition for Anthropic's `tools` parameter. The model MUST call
 * this before asserting any case holding from memory — the research
 * system prompt enforces that discipline.
 *
 * Keep this schema extremely minimal. More parameters means more model
 * ambiguity about when to call; one required string nails the contract.
 */
export const VERIFY_CITATION_TOOL = {
  name: "verify_citation",
  description:
    "Verify a legal citation (case, Treas. Reg., IRC section, IRM section, Rev. Rul., Rev. Proc., Notice, PLR) against the firm's authority database and CourtListener. Returns the canonical case/authority name, year, court/agency, source URL, and any supersession. You MUST call this tool before describing a case holding or the substance of any cited authority. If the tool returns 'not_found', drop the citation from your response or flag it as unverified — do not describe a holding from memory.",
  input_schema: {
    type: "object" as const,
    properties: {
      citation: {
        type: "string",
        description:
          "The exact citation to verify. Examples: '136 T.C. 137', 'Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)', 'T.C. Memo. 2013-54', '668 F.3d 1008', 'Rev. Rul. 69-184', 'Treas. Reg. § 301.7701-2(c)(2)(iv)', 'IRC § 1402(a)(13)', 'IRM 5.8.4.3.1'.",
      },
    },
    required: ["citation"] as string[],
  },
}

/**
 * Execute a verify_citation tool call from Claude's tool-use response.
 * Returns the result object that will be sent back as a `tool_result`
 * block. Format is kept minimal so it fits cleanly into a tool result.
 */
export async function executeVerifyCitation(input: {
  citation: string
}): Promise<{
  citation: string
  status: VerificationStatus
  verified_title?: string
  court_or_agency?: string
  year?: number
  summary?: string
  source_url?: string
  superseded_by?: string
  note?: string
  source_of_truth: string
}> {
  const result = await verifyCitation(input.citation)
  return {
    citation: result.raw,
    status: result.status,
    verified_title: result.verifiedTitle,
    court_or_agency: result.courtOrAgency,
    year: result.year,
    summary: result.summary,
    source_url: result.sourceUrl,
    superseded_by: result.supersededBy,
    note: result.note,
    source_of_truth: result.sourceOfTruth,
  }
}

// ── Internal helpers ────────────────────────────────────────────────

function yearOf(d: Date | null | undefined): number | undefined {
  if (!d) return undefined
  const y = new Date(d).getUTCFullYear()
  return Number.isFinite(y) ? y : undefined
}

function courtFromTier(tier: string, jurisdiction: string | null | undefined): string {
  // Tier values are the enum from prisma/schema.prisma: T1_STATUTE,
  // T2_REGULATION, T3_IRS_GUIDANCE, T4_CASE_LAW, T5_SECONDARY. We map to
  // plain-English surfaces for the tool result.
  switch (tier) {
    case "T1_STATUTE":   return "U.S. Code / Treasury"
    case "T2_REGULATION":return "Treasury / IRS Regulation"
    case "T3_IRS_GUIDANCE":return "IRS Guidance"
    case "T4_CASE_LAW":  return jurisdiction || "Court"
    case "T5_SECONDARY": return "Secondary Source"
    default:             return jurisdiction || tier
  }
}
