/**
 * PLR Parser — parses IRS Written Determinations (Private Letter Rulings,
 * Chief Counsel Advice, Technical Advice Memoranda) into structured
 * ParsedSections.
 *
 * Splits documents into sections: Issue, Facts, Law and Analysis,
 * Conclusion, and Cited Authorities.
 *
 * CRITICAL: ALL chunks MUST have:
 *   - authorityTier: C1
 *   - precedentialStatus: NONPRECEDENTIAL
 *
 * Per IRC § 6110(k)(3), written determinations may not be used or cited
 * as precedent.
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTHORITY_TIER = 'C1' as const
const PRECEDENTIAL_STATUS = 'NONPRECEDENTIAL' as const

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip HTML tags, decode entities, collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Section boundary patterns ──────────────────────────────────────────────

interface SectionBoundary {
  name: string
  displayTitle: string
  re: RegExp
}

const SECTION_BOUNDARIES: SectionBoundary[] = [
  {
    name: 'issue',
    displayTitle: 'Issue',
    re: /\bISSUES?\b[:\s]|(?:^|\n)\s*ISSUES?\s*(?:\n|$)/im,
  },
  {
    name: 'facts',
    displayTitle: 'Facts',
    re: /\bFACTS\b[:\s]|(?:^|\n)\s*FACTS\s*(?:\n|$)/im,
  },
  {
    name: 'law_and_analysis',
    displayTitle: 'Law and Analysis',
    re: /\bLAW\s+AND\s+ANALYSIS\b|\bANALYSIS\b[:\s]|(?:^|\n)\s*(?:LAW\s+AND\s+)?ANALYSIS\s*(?:\n|$)/im,
  },
  {
    name: 'conclusion',
    displayTitle: 'Conclusion',
    re: /\bCONCLUSIONS?\b[:\s]|(?:^|\n)\s*CONCLUSIONS?\s*(?:\n|$)|(?:^|\n)\s*HOLDINGS?\s*(?:\n|$)/im,
  },
  {
    name: 'cited_authorities',
    displayTitle: 'Cited Authorities',
    // This section is synthesized from citation extraction, not from a heading
    re: /(?!)/i, // Never matches — this section is built programmatically
  },
]

/** Detect the document type (PLR, CCA, TAM) from the content. */
function detectDocType(text: string): string {
  const upper = text.toUpperCase()
  if (upper.includes('CHIEF COUNSEL ADVICE') || upper.includes('CCA')) return 'CCA'
  if (upper.includes('TECHNICAL ADVICE MEMORANDUM') || upper.includes('TAM')) return 'TAM'
  return 'PLR'
}

/** Extract document number from text. */
function extractDocNumber(text: string): string {
  // PLR numbers are typically 9+ digits, e.g., 202301001
  const match = /(?:PLR|Number:?)\s*(\d{9,})/i.exec(text)
  if (match) return match[1]

  // Also check for UIL numbers or release numbers
  const releaseMatch = /Release\s+(?:Date|Number)[:\s]*([^\n]+)/i.exec(text)
  if (releaseMatch) return releaseMatch[1].trim()

  return ''
}

// ─── PLR Parser ─────────────────────────────────────────────────────────────

export class PlrParser extends BaseParser {
  /**
   * Parse a Written Determination (PLR, CCA, TAM) into structured sections.
   *
   * @param rawContent — HTML or plain text of the document
   * @param metadata — optional overrides (e.g., { documentNumber, documentType })
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    // Strip HTML if present
    const text = rawContent.trimStart().startsWith('<')
      ? stripHtml(rawContent)
      : rawContent

    const docType = (metadata?.documentType as string) ?? detectDocType(text)
    const docNumber = (metadata?.documentNumber as string) ?? extractDocNumber(text)
    const title = `${docType} ${docNumber}`.trim() || `Written Determination`

    // Find section boundaries
    const sections = this.buildSections(text, docType, docNumber, metadata)

    // Extract all citations from the full text
    const extracted = extractCitations(text)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    // Add a synthesized "Cited Authorities" section if citations were found
    if (citations.length > 0) {
      sections.push({
        title: 'Cited Authorities',
        citationString: title,
        normalizedCitation: docNumber ? `plr:${docNumber}` : '',
        content: citations.join('\n'),
        children: [],
        metadata: {
          documentType: docType,
          documentNumber: docNumber,
          citationCount: citations.length,
          sectionType: 'cited_authorities',
          precedentialStatus: PRECEDENTIAL_STATUS,
        },
        authorityTier: AUTHORITY_TIER,
        precedentialStatus: PRECEDENTIAL_STATUS, // ALWAYS NONPRECEDENTIAL
      })
    }

    return {
      sections,
      citations,
      title,
      sourceType: 'written_determination',
    }
  }

  /**
   * Build structured sections by finding section boundaries in the text.
   */
  private buildSections(
    text: string,
    docType: string,
    docNumber: string,
    metadata?: Record<string, unknown>
  ): ParsedSection[] {
    const sections: ParsedSection[] = []

    // Find all section boundaries (excluding cited_authorities which is synthesized)
    const activeBoundaries = SECTION_BOUNDARIES.filter((b) => b.name !== 'cited_authorities')
    const found: Array<{ boundary: SectionBoundary; index: number }> = []

    for (const boundary of activeBoundaries) {
      const match = boundary.re.exec(text)
      if (match) {
        found.push({ boundary, index: match.index })
      }
    }

    // Sort by position
    found.sort((a, b) => a.index - b.index)

    if (found.length === 0) {
      // No section boundaries found — create a single section for the entire document
      sections.push(this.createSection(
        'Full Document',
        text,
        docType,
        docNumber,
        'full_document',
        metadata
      ))
    } else {
      for (let i = 0; i < found.length; i++) {
        const { boundary, index } = found[i]
        const nextIndex = i + 1 < found.length ? found[i + 1].index : text.length
        const sectionText = text.slice(index, nextIndex).trim()

        sections.push(this.createSection(
          boundary.displayTitle,
          sectionText,
          docType,
          docNumber,
          boundary.name,
          metadata
        ))
      }
    }

    return sections
  }

  /**
   * Create a single ParsedSection. ALWAYS sets C1 / NONPRECEDENTIAL.
   */
  private createSection(
    title: string,
    content: string,
    docType: string,
    docNumber: string,
    sectionType: string,
    metadata?: Record<string, unknown>
  ): ParsedSection {
    const crossRefs = extractCitations(content)

    return {
      title,
      citationString: `${docType} ${docNumber}`.trim(),
      normalizedCitation: docNumber ? `plr:${docNumber}` : '',
      content,
      children: [],
      metadata: {
        documentType: docType,
        documentNumber: docNumber,
        sectionType,
        crossReferences: crossRefs.map((c) => c.normalized),
        precedentialStatus: PRECEDENTIAL_STATUS,
        ircSection6110k3: true, // Cannot be cited as precedent
        ...(metadata ?? {}),
      },
      authorityTier: AUTHORITY_TIER,           // ALWAYS C1
      precedentialStatus: PRECEDENTIAL_STATUS,  // ALWAYS NONPRECEDENTIAL
    }
  }
}
