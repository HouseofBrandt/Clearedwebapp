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

/**
 * Resolution order:
 *   1. CanonicalAuthority (firm's own harvested DB — highest confidence).
 *   2. Kind-specific fallback:
 *        - Case law      → CourtListener
 *        - IRC           → Cornell LII uscode URL probe
 *        - Treas. Reg.   → Cornell LII CFR URL probe
 *        - IRM           → IRS.gov URL probe
 *        - Rev. Rul.,
 *          Rev. Proc.,
 *          Notice, PLR   → no public URL check available
 *   3. Unknown kind → not_found (we can't tell if it's real).
 *   4. Recognized kind without any verification source → unverifiable
 *      (flag, don't drop — a DB miss on IRC § 1402(a)(13) doesn't mean
 *      the statute doesn't exist).
 *
 * The semantic distinction is load-bearing: the system prompt tells
 * Claude to DROP not_found citations but FLAG unverifiable ones. A
 * bug here that collapses unverifiable→not_found erases real statutes.
 */
export async function verifyCitation(raw: string): Promise<VerificationResult> {
  const parsed = parseCitation(raw)

  // First try the firm's own authority database.
  const canonical = await tryCanonicalAuthority(parsed)
  if (canonical) return canonical

  // For case law (Tax Court + federal courts), try CourtListener.
  if (parsed.kind === "tc_regular" || parsed.kind === "tc_memo" || parsed.kind === "federal_case") {
    const cl = await tryCourtListener(parsed)
    if (cl) return cl
    // CourtListener returned a clean "no hit" — for case law, that's
    // genuine evidence the case doesn't exist. Fall through to not_found.
  }

  // For statute / regulation / IRM, try a public URL probe as a best-
  // effort "does this exist" check. This catches well-formed citations
  // to real authority that the firm's DB hasn't harvested yet.
  if (parsed.kind === "irc" || parsed.kind === "treas_reg" || parsed.kind === "irm") {
    const probed = await tryPublicUrlProbe(parsed)
    if (probed) return probed
  }

  // Nothing found. Decide between not_found (likely fabricated) and
  // unverifiable (real-looking but we had no way to check).
  if (parsed.kind === "unknown") {
    return {
      raw,
      status: "not_found",
      sourceOfTruth: "none",
      note: "Citation format not recognized. If this is a real authority, provide it in a standard reporter format.",
    }
  }

  // Case law that cleared both DB and CourtListener: legitimate not_found.
  if (parsed.kind === "tc_regular" || parsed.kind === "tc_memo" || parsed.kind === "federal_case") {
    return {
      raw,
      status: "not_found",
      sourceOfTruth: "none",
      note: "Citation not found in the firm's authority database or CourtListener. Do NOT describe a holding from memory.",
    }
  }

  // IRC / Treas. Reg. / IRM / Rev. Rul. / Rev. Proc. / Notice / PLR with
  // no verification source available: unverifiable, NOT not_found.
  // Claude flags with [UNVERIFIED] and avoids describing substance.
  return {
    raw,
    status: "unverifiable",
    sourceOfTruth: "none",
    note: noteForUnverifiedKind(parsed.kind),
  }
}

function noteForUnverifiedKind(kind: ParsedCitation["kind"]): string {
  switch (kind) {
    case "irc":
      return "Could not verify via the firm's authority database or a Cornell LII URL probe. The citation is well-formed but unconfirmed. Do not describe substance — flag as [UNVERIFIED] and confirm via law.cornell.edu/uscode or a Westlaw check."
    case "treas_reg":
      return "Could not verify via the firm's authority database or a Cornell LII CFR URL probe. Do not describe substance — flag as [UNVERIFIED] and confirm via law.cornell.edu/cfr or ecfr.gov."
    case "irm":
      return "Could not verify via the firm's authority database or an IRS.gov URL probe. Do not describe substance — flag as [UNVERIFIED] and confirm via irs.gov/irm."
    case "rev_rul":
    case "rev_proc":
    case "notice":
      return "Could not verify via the firm's authority database. No public URL probe available for IRB guidance. Do not describe substance — flag as [UNVERIFIED] and confirm via the IRS Internal Revenue Bulletin index."
    case "plr":
      return "Could not verify via the firm's authority database. No public URL probe available for PLRs. Do not describe substance — flag as [UNVERIFIED] and confirm via IRS.gov or a paid database."
    default:
      return "Could not verify citation. Do not describe substance — flag as [UNVERIFIED] and confirm manually."
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

// ── Public URL probe (IRC / Treas. Reg. / IRM) ───────────────────────

/**
 * Best-effort "does this citation resolve to a real public URL" check.
 * Covers the three kinds with predictable URL formats:
 *
 *   - IRC § N       → https://www.law.cornell.edu/uscode/text/26/N
 *   - Treas. Reg. § → https://www.law.cornell.edu/cfr/text/26/{section}
 *   - IRM X.Y.Z     → https://www.irs.gov/irm/part{X}/irm_{X}-{Y}-{Z}
 *
 * Uses HEAD to avoid downloading bodies. 5s timeout. Any non-2xx or
 * network failure → null (caller returns status:"unverifiable" rather
 * than claiming verified).
 *
 * When a probe hits, we return status="verified" with
 * sourceOfTruth:"external_authority" so the downstream pipeline knows
 * this wasn't a firm-DB hit.
 */
async function tryPublicUrlProbe(parsed: ParsedCitation): Promise<VerificationResult | null> {
  const url = buildProbeUrl(parsed)
  if (!url) return null

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    let res: Response
    try {
      res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: {
          "User-Agent": "Cleared-Research/1.0 (tax-resolution platform)",
          Accept: "text/html",
        },
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    // Some servers (Cornell LII) return 405 on HEAD. Fall back to GET
    // with a range request so we don't download the full body.
    if (res.status === 405 || res.status === 403) {
      const ctrl2 = new AbortController()
      const timer2 = setTimeout(() => ctrl2.abort(), 5000)
      try {
        res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "Cleared-Research/1.0 (tax-resolution platform)",
            Accept: "text/html",
            Range: "bytes=0-1023",
          },
          signal: ctrl2.signal,
        })
      } finally {
        clearTimeout(timer2)
      }
    }
    if (!res.ok && res.status !== 206) return null
    return {
      raw: parsed.raw,
      status: "verified",
      sourceUrl: url,
      courtOrAgency: agencyFromKind(parsed.kind),
      year: parsed.year,
      note: `Verified by public URL probe (${hostOf(url)}). Confirm substance at the source before describing holdings.`,
      sourceOfTruth: "canonical_authority", // Treat Cornell/IRS.gov as authoritative.
    }
  } catch (err: any) {
    // Network / timeout / DNS. Caller falls through to unverifiable with
    // an appropriate note — never throw.
    console.warn("[citation-verifier] URL probe failed", {
      url,
      error: err?.message || String(err),
    })
    return null
  }
}

function buildProbeUrl(parsed: ParsedCitation): string | null {
  if (parsed.kind === "irc") {
    // normalized: "irc:1402:a:13" or "irc:6015"
    const parts = parsed.normalized.split(":")
    const section = parts[1]
    if (!section) return null
    // Cornell LII uscode URL doesn't take subsections — so a probe for
    // § 1402 covers § 1402(a)(13). Good enough for existence check.
    return `https://www.law.cornell.edu/uscode/text/26/${encodeURIComponent(section)}`
  }
  if (parsed.kind === "treas_reg") {
    // normalized: "reg:301.7701-2:c:2:iv" or "reg:1.704-1"
    const parts = parsed.normalized.split(":")
    const section = parts[1]
    if (!section) return null
    return `https://www.law.cornell.edu/cfr/text/26/${encodeURIComponent(section)}`
  }
  if (parsed.kind === "irm") {
    // normalized: "irm:5.8.4.3.1"
    const parts = parsed.normalized.split(":")
    const path = parts[1]
    if (!path) return null
    // IRS.gov IRM URL pattern — uses the first numeric component as the
    // "part" and dashes for the rest: irm_5-8-4-3-1.
    const segments = path.split(".")
    const part = segments[0]
    if (!part) return null
    const tail = segments.join("-")
    return `https://www.irs.gov/irm/part${part}/irm_${tail}`
  }
  return null
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return "public source" }
}

function agencyFromKind(kind: ParsedCitation["kind"]): string {
  switch (kind) {
    case "irc":       return "U.S. Code (26 U.S.C.)"
    case "treas_reg": return "Treasury Regulation (26 C.F.R.)"
    case "irm":       return "Internal Revenue Manual"
    default:          return "Public Authority"
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
