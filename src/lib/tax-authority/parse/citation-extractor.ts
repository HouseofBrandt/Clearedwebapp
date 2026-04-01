/**
 * Citation Extractor — regex + heuristic engine for finding and normalizing
 * tax authority citations in text.
 */

export interface ExtractedCitation {
  raw: string           // Original text matched
  normalized: string    // Normalized form like "irc:6015:b:1:B"
  type: 'irc' | 'reg' | 'irm' | 'irb' | 'tc' | 'plr'
  startIndex: number
  endIndex: number
}

// ─── Subsection parsing helpers ──────────────────────────────────────────────

/**
 * Parse a parenthetical subsection chain like "(b)(1)(B)" into ["b","1","B"].
 */
function parseSubsections(raw: string | undefined): string[] {
  if (!raw) return []
  const parts: string[] = []
  const re = /\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    parts.push(m[1])
  }
  return parts
}

/**
 * Parse a dot-separated subsection chain like "(c)(2)" or just "(c)" into
 * colon-joined suffix.
 */
function subsectionSuffix(raw: string | undefined): string {
  const parts = parseSubsections(raw)
  return parts.length > 0 ? ':' + parts.join(':') : ''
}

// ─── Individual citation patterns ────────────────────────────────────────────

interface CitationPattern {
  type: ExtractedCitation['type']
  regex: RegExp
  normalize: (match: RegExpExecArray) => string | null
}

const PATTERNS: CitationPattern[] = [
  // ── IRC / 26 U.S.C. ─────────────────────────────────────────────────────
  // "26 U.S.C. § 6015(b)(1)(B)"
  {
    type: 'irc',
    regex: /26\s+U\.?\s*S\.?\s*C\.?\s*[§\u00A7]\s*(\d+[A-Za-z]?)((?:\s*\([^)]+\))*)/g,
    normalize: (m) => `irc:${m[1]}${subsectionSuffix(m[2])}`,
  },
  // "IRC § 6015(b)(1)(B)" or "IRC §6015" or "I.R.C. § 6015"
  {
    type: 'irc',
    regex: /I\.?\s*R\.?\s*C\.?\s*[§\u00A7]\s*(\d+[A-Za-z]?)((?:\s*\([^)]+\))*)/gi,
    normalize: (m) => `irc:${m[1]}${subsectionSuffix(m[2])}`,
  },
  // "Section 6015(b)" or "Sec. 6015(b)" — only when it looks like an IRC section
  // (standalone number ≥ 2 digits, not preceded by IRM/CFR context)
  {
    type: 'irc',
    regex: /(?:Section|Sec\.)\s+(\d{2,}[A-Za-z]?)((?:\s*\([^)]+\))*)/gi,
    normalize: (m) => `irc:${m[1]}${subsectionSuffix(m[2])}`,
  },

  // ── Treasury Regulations / 26 C.F.R. ────────────────────────────────────
  // "Treas. Reg. § 301.7122-1(c)" or "Treasury Regulation § ..."
  {
    type: 'reg',
    regex: /(?:Treas(?:ury)?\.?\s*Reg(?:ulation)?s?\.?\s*[§\u00A7]?\s*)(\d+\.\d+[-\w]*)((?:\s*\([^)]+\))*)/gi,
    normalize: (m) => `reg:${m[1]}${subsectionSuffix(m[2])}`,
  },
  // "26 C.F.R. § 301.7122-1(c)"
  {
    type: 'reg',
    regex: /26\s+C\.?\s*F\.?\s*R\.?\s*[§\u00A7]\s*(\d+\.\d+[-\w]*)((?:\s*\([^)]+\))*)/gi,
    normalize: (m) => `reg:${m[1]}${subsectionSuffix(m[2])}`,
  },

  // ── IRM ──────────────────────────────────────────────────────────────────
  // "IRM 5.8.4.3.1" or "IRM § 5.8.4.3.1"
  {
    type: 'irm',
    regex: /IRM\s*[§\u00A7]?\s*(\d+(?:\.\d+)+)/gi,
    normalize: (m) => `irm:${m[1]}`,
  },

  // ── Revenue Rulings ──────────────────────────────────────────────────────
  // "Rev. Rul. 2020-15"
  {
    type: 'irb',
    regex: /Rev(?:enue)?\.?\s*Rul(?:ing)?\.?\s*(\d{4}-\d+)/gi,
    normalize: (m) => `irb:rev_rul:${m[1]}`,
  },

  // ── Revenue Procedures ───────────────────────────────────────────────────
  // "Rev. Proc. 2023-34"
  {
    type: 'irb',
    regex: /Rev(?:enue)?\.?\s*Proc(?:edure)?\.?\s*(\d{4}-\d+)/gi,
    normalize: (m) => `irb:rev_proc:${m[1]}`,
  },

  // ── Notices ──────────────────────────────────────────────────────────────
  // "Notice 2023-10"
  {
    type: 'irb',
    regex: /Notice\s+(\d{4}-\d+)/gi,
    normalize: (m) => `irb:notice:${m[1]}`,
  },

  // ── Tax Court Memo ───────────────────────────────────────────────────────
  // "Smith v. Commissioner, T.C. Memo. 2023-45"
  // We capture the case name loosely but the key is T.C. Memo.
  {
    type: 'tc',
    regex: /(?:[\w.']+\s+v\.?\s+(?:Commissioner|Comm'r|CIR),?\s*)?T\.?\s*C\.?\s*Memo\.?\s*(\d{4})-(\d+)/gi,
    normalize: (m) => `tc:memo:${m[1]}-${m[2]}`,
  },

  // ── Tax Court Regular ────────────────────────────────────────────────────
  // "160 T.C. No. 5" or "Smith v. Commissioner, 160 T.C. No. 5"
  {
    type: 'tc',
    regex: /(?:[\w.']+\s+v\.?\s+(?:Commissioner|Comm'r|CIR),?\s*)?(\d+)\s+T\.?\s*C\.?\s*No\.?\s*(\d+)/gi,
    normalize: (m) => `tc:regular:${m[1]}:${m[2]}`,
  },

  // ── Private Letter Rulings ───────────────────────────────────────────────
  // "PLR 202301001"
  {
    type: 'plr',
    regex: /PLR\s+(\d{9,})/gi,
    normalize: (m) => `plr:${m[1]}`,
  },
]

// ─── Main extraction function ────────────────────────────────────────────────

/**
 * Extract all tax citations from a block of text.
 * Returns de-duplicated citations sorted by their position in the text.
 */
export function extractCitations(text: string): ExtractedCitation[] {
  const results: ExtractedCitation[] = []
  // Track spans to avoid overlapping matches from multiple patterns
  const occupiedSpans: Array<[number, number]> = []

  function overlaps(start: number, end: number): boolean {
    return occupiedSpans.some(
      ([s, e]) => start < e && end > s
    )
  }

  for (const pattern of PATTERNS) {
    // Reset the regex state for each pass
    const re = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null

    while ((match = re.exec(text)) !== null) {
      const raw = match[0]
      const startIndex = match.index
      const endIndex = startIndex + raw.length

      // Skip if this span overlaps a previously matched citation
      if (overlaps(startIndex, endIndex)) continue

      const normalized = pattern.normalize(match)
      if (!normalized) continue

      results.push({
        raw,
        normalized,
        type: pattern.type,
        startIndex,
        endIndex,
      })

      occupiedSpans.push([startIndex, endIndex])
    }
  }

  // Sort by position in text
  results.sort((a, b) => a.startIndex - b.startIndex)

  return results
}

// ─── Standalone normalizer ───────────────────────────────────────────────────

/**
 * Attempt to normalize a single citation string. Returns null if the string
 * does not match any known citation pattern.
 */
export function normalizeCitation(raw: string): string | null {
  const citations = extractCitations(raw)
  if (citations.length === 0) return null
  return citations[0].normalized
}
