/**
 * Tax Court Parser — parses U.S. Tax Court opinion text into structured
 * ParsedSections.
 *
 * Takes raw text (extracted from PDF) and structures into:
 *   - Caption
 *   - Docket
 *   - Judge
 *   - Holding
 *   - Reasoning
 *   - Cited authorities
 *
 * All opinions are tier A5 with PRECEDENTIAL status (even memos, which
 * are precedential under Ballard v. Commissioner, 544 U.S. 40 (2005),
 * though they carry lower sub-tier weight).
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTHORITY_TIER = 'A5' as const
const PRECEDENTIAL_STATUS = 'PRECEDENTIAL' as const

// ─── Section detection patterns ─────────────────────────────────────────────

/**
 * Common section headings in Tax Court opinions.
 * These are used to split the opinion text into logical sections.
 */
const SECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'caption', re: /^(.+?v\.\s*Commissioner.*?)(?=\n\s*\n)/im },
  { name: 'docket', re: /Docket\s+No\.?\s*([\w-]+(?:,\s*[\w-]+)*)/i },
  { name: 'findings_of_fact', re: /FINDINGS?\s+OF\s+FACTS?/i },
  { name: 'opinion', re: /\bOPINION\b/i },
  { name: 'held', re: /\bHELD\b[:\s]/i },
  { name: 'background', re: /\bBACKGROUND\b/i },
  { name: 'discussion', re: /\bDISCUSSION\b/i },
  { name: 'analysis', re: /\bANALYSIS\b/i },
  { name: 'conclusion', re: /\bCONCLUSION\b/i },
]

/** Match the judge line: "JUDGE NAME, Judge:" or "LASTNAME, Judge." */
const JUDGE_RE = /(?:^|\n)\s*([A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+)*),\s*(?:Chief\s+)?(?:Special\s+Trial\s+)?Judge[.:\s]/m

/** Match docket number pattern */
const DOCKET_RE = /Docket\s+No\.?\s*([\w-]+(?:,\s*[\w-]+)*)/i

/** Detect opinion type from text */
function detectOpinionType(text: string): string {
  const upper = text.toUpperCase()
  if (upper.includes('T.C. MEMO') || upper.includes('MEMORANDUM FINDINGS')) {
    return 'memorandum'
  }
  if (upper.includes('SUMMARY OPINION') || upper.includes('S OPINION')) {
    return 'summary'
  }
  if (upper.includes('REVIEWED BY THE COURT')) {
    return 'reviewed'
  }
  return 'regular'
}

/** Extract the case caption from the beginning of the opinion. */
function extractCaption(text: string): string {
  // The caption is usually in the first few lines, ending before the docket info
  const lines = text.split('\n').slice(0, 15)
  const captionLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (captionLines.length > 0) break
      continue
    }
    captionLines.push(trimmed)
    // Stop at the "v. Commissioner" line or docket line
    if (/v\.\s*Commissioner/i.test(trimmed)) break
    if (/Docket\s+No/i.test(trimmed)) break
  }

  return captionLines.join(' ')
}

// ─── Tax Court Parser ────────────────────────────────────────────────────────

export class TaxCourtParser extends BaseParser {
  /**
   * Parse a Tax Court opinion into structured sections.
   *
   * @param rawContent — plain text of the opinion (extracted from PDF)
   * @param metadata — optional overrides (e.g., { caseName, docketNumber, judge })
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    // If the content is base64-encoded PDF, we expect it to have been
    // pre-extracted to text before reaching the parser. If it still looks
    // like base64, note it in the output.
    const text = this.normalizeText(rawContent)

    const caption = (metadata?.caseName as string) ?? extractCaption(text)
    const docketMatch = DOCKET_RE.exec(text)
    const docket = (metadata?.docketNumber as string) ?? docketMatch?.[1] ?? ''
    const judgeMatch = JUDGE_RE.exec(text)
    const judge = (metadata?.judge as string) ?? judgeMatch?.[1]?.trim() ?? ''
    const opinionType = (metadata?.opinionType as string) ?? detectOpinionType(text)

    const title = caption || `Tax Court Opinion — Docket ${docket}`

    // Split into sections
    const sections = this.buildSections(text, {
      caption,
      docket,
      judge,
      opinionType,
      metadata,
    })

    // Extract all citations from the full text
    const extracted = extractCitations(text)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title,
      sourceType: 'tax_court_opinion',
    }
  }

  /**
   * Normalize text: collapse excessive whitespace, standardize line endings.
   */
  private normalizeText(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()
  }

  /**
   * Build structured sections from the opinion text.
   */
  private buildSections(
    text: string,
    context: {
      caption: string
      docket: string
      judge: string
      opinionType: string
      metadata?: Record<string, unknown>
    }
  ): ParsedSection[] {
    const sections: ParsedSection[] = []
    const { caption, docket, judge, opinionType, metadata } = context

    // Find all section boundaries in the text
    const boundaries = this.findSectionBoundaries(text)

    if (boundaries.length === 0) {
      // No clear sections found — create a single holding + reasoning structure
      sections.push(this.createSection(
        'Opinion',
        text,
        caption,
        docket,
        opinionType,
        metadata
      ))
    } else {
      for (let i = 0; i < boundaries.length; i++) {
        const boundary = boundaries[i]
        const nextStart = i + 1 < boundaries.length
          ? boundaries[i + 1].index
          : text.length
        const sectionText = text.slice(boundary.index, nextStart).trim()

        sections.push(this.createSection(
          boundary.name,
          sectionText,
          caption,
          docket,
          opinionType,
          metadata
        ))
      }
    }

    // Always add a caption section at the front if we have one
    if (caption && (!sections.length || sections[0].title !== 'Caption')) {
      sections.unshift({
        title: 'Caption',
        citationString: caption,
        normalizedCitation: this.buildCitation(docket, opinionType),
        content: [
          `Case: ${caption}`,
          `Docket: ${docket}`,
          `Judge: ${judge}`,
          `Opinion Type: ${opinionType}`,
        ].join('\n'),
        children: [],
        metadata: {
          docket,
          judge,
          opinionType,
          ...(metadata ?? {}),
        },
        authorityTier: AUTHORITY_TIER,
        precedentialStatus: PRECEDENTIAL_STATUS,
      })
    }

    return sections
  }

  /**
   * Find section boundaries in the opinion text.
   */
  private findSectionBoundaries(text: string): Array<{ name: string; index: number }> {
    const boundaries: Array<{ name: string; index: number }> = []
    const seen = new Set<string>()

    // Look for common section headings on their own lines
    const lines = text.split('\n')
    let currentIndex = 0

    for (const line of lines) {
      const trimmed = line.trim().toUpperCase()

      for (const pattern of SECTION_PATTERNS) {
        if (pattern.name === 'caption' || pattern.name === 'docket') continue

        if (pattern.re.test(trimmed) && !seen.has(pattern.name)) {
          seen.add(pattern.name)
          boundaries.push({ name: pattern.name, index: currentIndex })
          break
        }
      }

      currentIndex += line.length + 1 // +1 for newline
    }

    boundaries.sort((a, b) => a.index - b.index)
    return boundaries
  }

  /**
   * Create a ParsedSection for a portion of the opinion.
   */
  private createSection(
    name: string,
    content: string,
    caption: string,
    docket: string,
    opinionType: string,
    metadata?: Record<string, unknown>
  ): ParsedSection {
    const crossRefs = extractCitations(content)

    // Map section names to display titles
    const titleMap: Record<string, string> = {
      findings_of_fact: 'Findings of Fact',
      opinion: 'Opinion',
      held: 'Holding',
      background: 'Background',
      discussion: 'Discussion',
      analysis: 'Analysis',
      conclusion: 'Conclusion',
    }

    return {
      title: titleMap[name] ?? name.charAt(0).toUpperCase() + name.slice(1),
      citationString: caption,
      normalizedCitation: this.buildCitation(docket, opinionType),
      content,
      children: [],
      metadata: {
        sectionType: name,
        opinionType,
        crossReferences: crossRefs.map((c) => c.normalized),
        ...(metadata ?? {}),
      },
      authorityTier: AUTHORITY_TIER,
      precedentialStatus: PRECEDENTIAL_STATUS,
    }
  }

  /**
   * Build a normalized citation for a Tax Court opinion.
   */
  private buildCitation(docket: string, opinionType: string): string {
    if (!docket) return ''
    const typePrefix = opinionType === 'memorandum' ? 'memo' : opinionType === 'summary' ? 'summary' : 'regular'
    return `tc:${typePrefix}:${docket}`
  }
}
