/**
 * Bluebook citation formatter for tax practice authorities.
 *
 * Purpose
 * -------
 * Practitioners file work product (case memos, penalty abatement letters, OIC
 * narratives, appeals rebuttals) with the IRS, Appeals, Tax Court, and clients.
 * Every cited authority should match Bluebook form — that is the professional
 * baseline and anything less gets flagged in appeals briefs and audits.
 *
 * This module provides:
 *   1. Structured citation types covering the tax authorities we actually cite
 *      in practice (IRC, Treas. Reg., Rev. Proc., Rev. Rul., Notice, Ann.,
 *      Tax Court / federal court decisions, IRM).
 *   2. A single `formatBluebook()` entry point plus per-type helpers so callers
 *      can build citations programmatically without memorizing comma and italic
 *      conventions.
 *   3. A `parseStructuredCitation()` helper for the (rare) case where the AI
 *      emits a JSON citation payload instead of a pre-formatted string.
 *
 * This module does NOT try to enforce Bluebook for every possible authority —
 * the AI is responsible for emitting correct citation text, and this module
 * exists so the rest of the platform can verify, normalize, and render those
 * citations consistently.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CitationType =
  | "irc"
  | "treas_reg"
  | "rev_proc"
  | "rev_rul"
  | "notice"
  | "announcement"
  | "tax_court"
  | "federal_court"
  | "irm"
  | "cfr"
  | "pub"
  | "other"

export interface IRCCitation {
  type: "irc"
  section: string // e.g. "6651(a)(1)"
  pinpoint?: string // e.g. "(2)"
}

export interface TreasRegCitation {
  type: "treas_reg"
  section: string // e.g. "301.7122-1(c)(1)"
  pinpoint?: string
}

export interface RevProcCitation {
  type: "rev_proc"
  year: number
  number: number // e.g. 71 for Rev. Proc. 2003-71
  cbYear?: number // e.g. 2003
  cbVolume?: string // "1" or "2"
  cbPage?: number // e.g. 517
}

export interface RevRulCitation {
  type: "rev_rul"
  year: number
  number: number
  cbYear?: number
  cbVolume?: string
  cbPage?: number
}

export interface NoticeCitation {
  type: "notice"
  year: number
  number: number
  irbYear?: number
  irbIssue?: number
  irbPage?: number
}

export interface AnnouncementCitation {
  type: "announcement"
  year: number
  number: number
  irbYear?: number
  irbIssue?: number
  irbPage?: number
}

export interface TaxCourtCitation {
  type: "tax_court"
  caseName: string // e.g. "Smith v. Commissioner"
  volume: number // e.g. 123
  reporter: "T.C." | "T.C.M." | "T.C. Memo." | "T.C. Summ. Op."
  page: string | number // e.g. 456 or "2020-81"
  year: number
}

export interface FederalCourtCitation {
  type: "federal_court"
  caseName: string
  volume: number
  reporter: string // e.g. "F.3d", "F. Supp. 2d", "U.S."
  page: number
  court?: string // e.g. "9th Cir.", "S.D.N.Y."
  year: number
}

export interface IRMCitation {
  type: "irm"
  section: string // e.g. "5.8.5.3.1"
  title?: string // optional descriptive title
}

export interface CFRCitation {
  type: "cfr"
  title: number // e.g. 26
  section: string // e.g. "301.7122-1"
}

export interface PubCitation {
  type: "pub"
  number: string // e.g. "594"
  title?: string
}

export interface OtherCitation {
  type: "other"
  text: string // pre-formatted
}

export type Citation =
  | IRCCitation
  | TreasRegCitation
  | RevProcCitation
  | RevRulCitation
  | NoticeCitation
  | AnnouncementCitation
  | TaxCourtCitation
  | FederalCourtCitation
  | IRMCitation
  | CFRCitation
  | PubCitation
  | OtherCitation

// ── Formatters ───────────────────────────────────────────────────────────────

/**
 * IRC § X(y)(z) — no italics. Section symbol is "§" (U+00A7).
 * Bluebook T1.2: Internal Revenue Code citations drop the title and use I.R.C.
 */
export function formatIRC(c: IRCCitation): string {
  const pin = c.pinpoint ? c.pinpoint : ""
  return `I.R.C. \u00A7 ${c.section}${pin}`.trim()
}

/**
 * Treas. Reg. § X.Y-Z. Bluebook: Treasury Regulations are cited by their
 * assigned number (not 26 C.F.R.) when the full number is stable.
 */
export function formatTreasReg(c: TreasRegCitation): string {
  const pin = c.pinpoint ? c.pinpoint : ""
  return `Treas. Reg. \u00A7 ${c.section}${pin}`.trim()
}

/**
 * Rev. Proc. YYYY-NNN, YYYY-V C.B. PPP.
 * The C.B. citation is optional for recent Rev. Procs. not yet cumulative-bulletined.
 */
export function formatRevProc(c: RevProcCitation): string {
  const base = `Rev. Proc. ${c.year}-${c.number}`
  if (c.cbYear && c.cbVolume && c.cbPage) {
    return `${base}, ${c.cbYear}-${c.cbVolume} C.B. ${c.cbPage}`
  }
  return base
}

/**
 * Rev. Rul. YYYY-NNN, YYYY-V C.B. PPP.
 */
export function formatRevRul(c: RevRulCitation): string {
  const base = `Rev. Rul. ${c.year}-${c.number}`
  if (c.cbYear && c.cbVolume && c.cbPage) {
    return `${base}, ${c.cbYear}-${c.cbVolume} C.B. ${c.cbPage}`
  }
  return base
}

/**
 * Notice YYYY-NNN, YYYY-II I.R.B. PPP.
 */
export function formatNotice(c: NoticeCitation): string {
  const base = `Notice ${c.year}-${c.number}`
  if (c.irbYear && c.irbIssue != null && c.irbPage != null) {
    return `${base}, ${c.irbYear}-${c.irbIssue} I.R.B. ${c.irbPage}`
  }
  return base
}

/**
 * Announcement YYYY-NNN.
 */
export function formatAnnouncement(c: AnnouncementCitation): string {
  const base = `Announcement ${c.year}-${c.number}`
  if (c.irbYear && c.irbIssue != null && c.irbPage != null) {
    return `${base}, ${c.irbYear}-${c.irbIssue} I.R.B. ${c.irbPage}`
  }
  return base
}

/**
 * Tax Court decisions. Reporter is typically T.C. (regular) or T.C.M./T.C. Memo.
 * (memorandum). Case name is italicized in Bluebook — we return the plain text
 * here and let the renderer apply the italics.
 */
export function formatTaxCourt(c: TaxCourtCitation): string {
  return `${c.caseName}, ${c.volume} ${c.reporter} ${c.page} (${c.year})`
}

/**
 * Federal court decisions (District, Circuit, Supreme, Claims).
 * Court parenthetical is omitted for U.S. Supreme Court cites.
 */
export function formatFederalCourt(c: FederalCourtCitation): string {
  const base = `${c.caseName}, ${c.volume} ${c.reporter} ${c.page}`
  if (c.reporter.trim() === "U.S.") {
    return `${base} (${c.year})`
  }
  if (c.court) {
    return `${base} (${c.court} ${c.year})`
  }
  return `${base} (${c.year})`
}

/**
 * Internal Revenue Manual.
 */
export function formatIRM(c: IRMCitation): string {
  return `IRM ${c.section}`
}

/**
 * 26 C.F.R. § X.Y-Z.
 */
export function formatCFR(c: CFRCitation): string {
  return `${c.title} C.F.R. \u00A7 ${c.section}`
}

/**
 * IRS Publication.
 */
export function formatPub(c: PubCitation): string {
  if (c.title) {
    return `I.R.S. Pub. ${c.number}, ${c.title}`
  }
  return `I.R.S. Pub. ${c.number}`
}

/**
 * Unified entry point. Dispatches to the per-type formatter.
 */
export function formatBluebook(c: Citation): string {
  switch (c.type) {
    case "irc":
      return formatIRC(c)
    case "treas_reg":
      return formatTreasReg(c)
    case "rev_proc":
      return formatRevProc(c)
    case "rev_rul":
      return formatRevRul(c)
    case "notice":
      return formatNotice(c)
    case "announcement":
      return formatAnnouncement(c)
    case "tax_court":
      return formatTaxCourt(c)
    case "federal_court":
      return formatFederalCourt(c)
    case "irm":
      return formatIRM(c)
    case "cfr":
      return formatCFR(c)
    case "pub":
      return formatPub(c)
    case "other":
      return c.text
  }
}

// ── Parse structured citations (JSON → Citation) ────────────────────────────

/**
 * If the AI returns a structured citation as JSON (e.g. inside a footnote),
 * parse it into our typed form. Unknown shapes fall through as "other" text
 * so nothing gets silently dropped from the document.
 */
export function parseStructuredCitation(raw: string): Citation {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) {
    return { type: "other", text: trimmed }
  }
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === "object" && "type" in obj) {
      return obj as Citation
    }
    return { type: "other", text: trimmed }
  } catch {
    return { type: "other", text: trimmed }
  }
}

// ── Validation helpers ──────────────────────────────────────────────────────

/**
 * Quick sanity check — does this string plausibly look like a Bluebook tax
 * citation? Used to flag footnotes that may need practitioner attention before
 * filing. Returns `{ ok, kind }` where `ok` is false if the string is very
 * unlikely to be a valid citation.
 */
export function looksLikeBluebookCitation(s: string): { ok: boolean; kind?: CitationType } {
  const t = s.trim()
  if (t.length < 5) return { ok: false }

  if (/^I\.R\.C\.\s*\u00A7/.test(t)) return { ok: true, kind: "irc" }
  if (/^Treas\.\s*Reg\.\s*\u00A7/.test(t)) return { ok: true, kind: "treas_reg" }
  if (/^Rev\.\s*Proc\.\s*\d{4}/.test(t)) return { ok: true, kind: "rev_proc" }
  if (/^Rev\.\s*Rul\.\s*\d{4}/.test(t)) return { ok: true, kind: "rev_rul" }
  if (/^Notice\s+\d{4}/.test(t)) return { ok: true, kind: "notice" }
  if (/^Announcement\s+\d{4}/.test(t)) return { ok: true, kind: "announcement" }
  if (/^IRM\s+\d/.test(t)) return { ok: true, kind: "irm" }
  if (/\d+\s+C\.F\.R\.\s*\u00A7/.test(t)) return { ok: true, kind: "cfr" }
  if (/\b\d+\s+T\.C\.(M\.|\s+Memo\.|\s+Summ\.\s+Op\.)?\s+[\d-]+\s*\(\d{4}\)/.test(t)) {
    return { ok: true, kind: "tax_court" }
  }
  if (/\b\d+\s+(F\.|U\.S\.|S\.\s*Ct\.|F\.?\s*Supp\.?)\s*\d*\s*\d+\s*\(/.test(t)) {
    return { ok: true, kind: "federal_court" }
  }
  if (/I\.R\.S\.\s*Pub\./.test(t)) return { ok: true, kind: "pub" }

  // Didn't match a known form — still may be valid (e.g. secondary sources),
  // but flag for practitioner review.
  return { ok: false }
}
