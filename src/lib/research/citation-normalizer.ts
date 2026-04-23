/**
 * Citation normalizer for the verify_citation tool.
 *
 * Maps raw citation strings the model produces (examples below) into a
 * structured form with a canonical `normalizedCitation` that matches the
 * `CanonicalAuthority.normalizedCitation` column.
 *
 * The patterns here are a focused subset of `src/lib/tax-authority/parse/
 * citation-extractor.ts`. That file is for HARVEST (parsing long source
 * text for any citation shape); this file is for VERIFY (taking a
 * practitioner-or-LLM-emitted citation and classifying it). Two different
 * problems, worth keeping separate.
 *
 * Examples of what the LLM emits that we need to recognize:
 *   "136 T.C. 137"
 *   "136 T.C. 137 (2011)"
 *   "Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)"
 *   "T.C. Memo. 2013-54"
 *   "668 F.3d 1008 (8th Cir. 2012)"
 *   "919 F. Supp. 2d 1140 (D.N.M. 2013)"
 *   "Rev. Rul. 69-184"
 *   "Rev. Proc. 2023-34"
 *   "Treas. Reg. § 301.7701-2(c)(2)(iv)"
 *   "IRC § 1402(a)(13)"
 *   "26 U.S.C. § 6015"
 *   "IRM 5.8.4.3.1"
 *   "Notice 2023-10"
 *   "PLR 202301001"
 */

export type CitationKind =
  | "tc_regular"      // Tax Court regular opinion, e.g. 136 T.C. 137
  | "tc_memo"         // Tax Court memo, e.g. T.C. Memo. 2013-54
  | "federal_case"    // U.S., F.3d, F.Supp.2d, F.App'x etc.
  | "irc"             // Internal Revenue Code section
  | "treas_reg"       // Treasury Regulation
  | "irm"             // Internal Revenue Manual
  | "rev_rul"         // Revenue Ruling
  | "rev_proc"        // Revenue Procedure
  | "notice"          // IRS Notice
  | "plr"             // Private Letter Ruling
  | "unknown"

export interface ParsedCitation {
  raw: string
  kind: CitationKind
  /** Canonical form, matches CanonicalAuthority.normalizedCitation convention. */
  normalized: string
  /** Optional case-party name if the raw string included "X v. Y". */
  partyName?: string
  /** Optional year if parseable from the raw string. */
  year?: number
}

/** Normalize a raw citation. Returns kind "unknown" if nothing matches. */
export function parseCitation(raw: string): ParsedCitation {
  const s = (raw || "").trim()
  if (!s) return { raw, kind: "unknown", normalized: "" }

  // Try each pattern in order of specificity. First match wins.

  // Tax Court memo: "T.C. Memo. 2013-54" or "T.C. Memo 2013-54"
  const tcMemo = s.match(/T\.C\.\s*Memo\.?\s*(\d{4})-(\d+)/i)
  if (tcMemo) {
    return {
      raw,
      kind: "tc_memo",
      normalized: `tc:memo:${tcMemo[1]}-${tcMemo[2]}`,
      year: Number(tcMemo[1]),
      partyName: extractPartyName(s),
    }
  }

  // Tax Court regular: "136 T.C. 137" (NOT preceded by "Memo.")
  const tcRegular = s.match(/(?<!Memo\.?\s*)(?<!Memo\s)\b(\d+)\s+T\.C\.(?!\s*Memo)\s+(\d+)/)
  if (tcRegular) {
    const yearMatch = s.match(/\((\d{4})\)/)
    return {
      raw,
      kind: "tc_regular",
      normalized: `tc:regular:${tcRegular[1]}:${tcRegular[2]}`,
      year: yearMatch ? Number(yearMatch[1]) : undefined,
      partyName: extractPartyName(s),
    }
  }

  // Federal reporter: "668 F.3d 1008", "919 F. Supp. 2d 1140", "500 U.S. 72"
  const fedCase = s.match(
    /\b(\d+)\s+(U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.(?:\s*2d)?|F\.\s*\d*[dh]?|F\.\s*Supp\.\s*\d*[dh]?|F\.\s*App'?x|Fed\.\s*Cl\.|B\.R\.|T\.C\.\s*Rptr\.)\s+(\d+)/i
  )
  if (fedCase) {
    const reporterClean = fedCase[2].replace(/\s+/g, "").replace(/\.$/, "")
    const yearMatch = s.match(/\((?:[^)]*?)(\d{4})\)/)
    return {
      raw,
      kind: "federal_case",
      normalized: `fed:${fedCase[1]}:${reporterClean}:${fedCase[3]}`,
      year: yearMatch ? Number(yearMatch[1]) : undefined,
      partyName: extractPartyName(s),
    }
  }

  // IRC / U.S.C. section: "IRC § 1402(a)(13)" or "26 U.S.C. § 1402"
  const irc = s.match(/(?:26\s*U\.S\.C\.|IRC|I\.R\.C\.)\s*§\s*([\d]+[A-Za-z]?)((?:\([^)]+\))+)?/i)
  if (irc) {
    const subs = (irc[2] || "")
      .match(/\(([^)]+)\)/g)
      ?.map((x) => x.slice(1, -1).trim())
      .join(":") || ""
    const normalized = subs ? `irc:${irc[1]}:${subs}` : `irc:${irc[1]}`
    return { raw, kind: "irc", normalized }
  }

  // Treas. Reg.: "Treas. Reg. § 301.7701-2(c)(2)(iv)" or "26 C.F.R. § 301.7701-2"
  const treasReg = s.match(/(?:Treas\.?\s*Reg\.?|26\s*C\.F\.R\.)\s*§\s*([\d.]+(?:-\d+)?)((?:\([^)]+\))+)?/i)
  if (treasReg) {
    const subs = (treasReg[2] || "")
      .match(/\(([^)]+)\)/g)
      ?.map((x) => x.slice(1, -1).trim())
      .join(":") || ""
    const normalized = subs ? `reg:${treasReg[1]}:${subs}` : `reg:${treasReg[1]}`
    return { raw, kind: "treas_reg", normalized }
  }

  // IRM: "IRM 5.8.4.3.1"
  const irm = s.match(/\bIRM\s+(\d+(?:\.\d+){1,5})/i)
  if (irm) {
    return { raw, kind: "irm", normalized: `irm:${irm[1]}` }
  }

  // Rev. Rul.: "Rev. Rul. 69-184" or "Revenue Ruling 69-184"
  const revRul = s.match(/(?:Rev\.?\s*Rul\.?|Revenue\s+Ruling)\s+(\d{2,4})-(\d+)/i)
  if (revRul) {
    return {
      raw,
      kind: "rev_rul",
      normalized: `irb:rev_rul:${revRul[1]}-${revRul[2]}`,
    }
  }

  // Rev. Proc.: "Rev. Proc. 2023-34"
  const revProc = s.match(/(?:Rev\.?\s*Proc\.?|Revenue\s+Procedure)\s+(\d{2,4})-(\d+)/i)
  if (revProc) {
    return {
      raw,
      kind: "rev_proc",
      normalized: `irb:rev_proc:${revProc[1]}-${revProc[2]}`,
    }
  }

  // Notice: "Notice 2023-10"
  const notice = s.match(/\bNotice\s+(\d{2,4})-(\d+)/i)
  if (notice) {
    return {
      raw,
      kind: "notice",
      normalized: `irb:notice:${notice[1]}-${notice[2]}`,
    }
  }

  // PLR: "PLR 202301001"
  const plr = s.match(/\bPLR\s+(\d{9,})/i)
  if (plr) {
    return { raw, kind: "plr", normalized: `plr:${plr[1]}` }
  }

  return { raw, kind: "unknown", normalized: "" }
}

/**
 * Extract "X v. Y" style party name from a raw citation. Returns undefined
 * when no "v." pattern is present (the LLM sometimes supplies just the
 * reporter, "136 T.C. 137").
 */
function extractPartyName(s: string): string | undefined {
  // Match leading "Party v. Party" before the reporter/cite.
  const m = s.match(/^([A-Z][\w\s.,'&-]+?v\.\s+[A-Z][\w\s.,'&-]+?)(?:,\s*\d|\s+\d+\s+[A-Z])/)
  return m ? m[1].trim() : undefined
}

/**
 * Scan a body of text (a composed research memo) for citation shapes we
 * recognize. Each hit is passed through parseCitation so downstream code
 * gets a structured `ParsedCitation` with the canonical `normalized` key.
 *
 * Used by the research pipeline's backfill pass: after the model returns a
 * memo, we re-check every citation it wrote to make sure it was actually
 * verified. Catches lazy models that forget to call verify_citation.
 *
 * Deduplicates by `normalized`. Citations with kind="unknown" are dropped.
 */
export function scanCitations(text: string): ParsedCitation[] {
  if (!text) return []

  // Order matters: tc_memo before tc_regular (since "T.C. Memo. 2013-54"
  // contains "T.C."), federal_case after both tc variants to avoid
  // miscategorizing "T.C." as a federal reporter.
  const patterns: Array<RegExp> = [
    // Case citations with optional leading party name.
    /(?:[A-Z][\w.'&,-]*(?:\s+[\w.'&,-]+)*\s+v\.\s+[\w.'&,-]+(?:\s+[\w.'&,-]+)*?,\s*)?T\.C\.\s*Memo\.?\s*\d{4}-\d+(?:\s*\(\d{4}\))?/g,
    /(?:[A-Z][\w.'&,-]*(?:\s+[\w.'&,-]+)*\s+v\.\s+[\w.'&,-]+(?:\s+[\w.'&,-]+)*?,\s*)?\d+\s+T\.C\.\s+\d+(?:\s*\(\d{4}\))?/g,
    /(?:[A-Z][\w.'&,-]*(?:\s+[\w.'&,-]+)*\s+v\.\s+[\w.'&,-]+(?:\s+[\w.'&,-]+)*?,\s*)?\d+\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.(?:\s*2d)?|F\.\s*\d*[dh]?|F\.\s*Supp\.\s*\d*[dh]?|F\.\s*App'?x|Fed\.\s*Cl\.|B\.R\.)\s+\d+(?:\s*\([^)]*\))?/g,
    // Agency guidance + statute + regs.
    /(?:26\s*U\.S\.C\.|IRC|I\.R\.C\.)\s*§\s*\d+[A-Za-z]?(?:\([^)]+\))*/g,
    /(?:Treas\.?\s*Reg\.?|26\s*C\.F\.R\.)\s*§\s*[\d.]+(?:-\d+)?(?:\([^)]+\))*/g,
    /\bIRM\s+\d+(?:\.\d+){1,5}/g,
    /(?:Rev\.?\s*Rul\.?|Revenue\s+Ruling)\s+\d{2,4}-\d+/g,
    /(?:Rev\.?\s*Proc\.?|Revenue\s+Procedure)\s+\d{2,4}-\d+/g,
    /\bNotice\s+\d{2,4}-\d+/g,
    /\bPLR\s+\d{9,}/g,
  ]

  const seen = new Set<string>()
  const hits: ParsedCitation[] = []

  for (const rx of patterns) {
    const matches = text.match(rx)
    if (!matches) continue
    for (const raw of matches) {
      const parsed = parseCitation(raw.trim())
      if (parsed.kind === "unknown" || !parsed.normalized) continue
      if (seen.has(parsed.normalized)) continue
      seen.add(parsed.normalized)
      hits.push(parsed)
    }
  }

  return hits
}
