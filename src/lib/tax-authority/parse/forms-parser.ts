/**
 * Forms Parser — parses IRS Forms, Instructions, and Publications into
 * structured ParsedSections.
 *
 * Extracts:
 *   - Form number and title
 *   - Tax year / revision date
 *   - Instruction text sections
 *
 * Authority tier: B2 (official IRS forms and publications)
 * Precedential status: INFORMATIONAL
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTHORITY_TIER = 'B2' as const
const PRECEDENTIAL_STATUS = 'INFORMATIONAL' as const

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

/** Extract form number from text or filename patterns. */
function extractFormNumber(text: string): string {
  // "Form 433-A" or "Form 656" patterns
  const formMatch = /Form\s+([\w-]+)/i.exec(text)
  if (formMatch) return formMatch[1]

  // "Publication 1" or "Pub. 594" patterns
  const pubMatch = /Pub(?:lication)?\.?\s+(\d+)/i.exec(text)
  if (pubMatch) return `p${pubMatch[1]}`

  return ''
}

/** Extract tax year from text. */
function extractTaxYear(text: string): string {
  // "For use in preparing 2025 returns" or "(Rev. January 2025)"
  const yearMatch = /(?:Tax\s+Year|preparing)\s+(\d{4})/i.exec(text)
  if (yearMatch) return yearMatch[1]

  // Revision date pattern
  const revMatch = /\(Rev\.?\s+(?:\w+\s+)?(\d{4})\)/i.exec(text)
  if (revMatch) return revMatch[1]

  return ''
}

/** Extract revision date from text. */
function extractRevisionDate(text: string): string {
  // "(Rev. January 2025)" or "(Revised 01/2025)"
  const revMatch = /\(Rev(?:ised)?\.?\s+([^)]+)\)/i.exec(text)
  if (revMatch) return revMatch[1].trim()

  // "Revision Date: ..." pattern
  const dateMatch = /Revision\s+Date[:\s]+([^\n]+)/i.exec(text)
  if (dateMatch) return dateMatch[1].trim()

  return ''
}

/** Detect if this is a publication vs a form. */
function isPublication(text: string, formNumber: string): boolean {
  if (formNumber.startsWith('p')) return true
  return /Publication\s+\d/i.test(text)
}

// ─── Section boundary patterns for instructions/publications ─────────────────

const INSTRUCTION_SECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'general_instructions', re: /\bGeneral\s+Instructions\b/i },
  { name: 'specific_instructions', re: /\bSpecific\s+Instructions\b/i },
  { name: 'purpose', re: /\bPurpose\s+of\s+(?:This\s+)?Form\b|\bWhat(?:'s|\s+Is)\s+(?:This|the)\s+Purpose\b/i },
  { name: 'who_must_file', re: /\bWho\s+(?:Must|Should|Can)\s+File\b/i },
  { name: 'when_to_file', re: /\bWhen\s+(?:To|Should\s+(?:You|I))\s+File\b/i },
  { name: 'where_to_file', re: /\bWhere\s+(?:To|Should\s+(?:You|I))\s+File\b/i },
  { name: 'definitions', re: /\bDefinitions\b/i },
  { name: 'line_instructions', re: /\bLine\s+\d+/i },
  { name: 'introduction', re: /\bIntroduction\b/i },
  { name: 'whats_new', re: /\bWhat(?:'s|\s+Is)\s+New\b/i },
]

// ─── Forms Parser ───────────────────────────────────────────────────────────

export class FormsParser extends BaseParser {
  /**
   * Parse an IRS form, instructions page, or publication into structured sections.
   *
   * @param rawContent — HTML or plain text of the document. For PDFs, expects
   *   pre-extracted text.
   * @param metadata — optional overrides (e.g., { formNumber, revisionDate })
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    // Strip HTML if present
    const text = rawContent.trimStart().startsWith('<')
      ? stripHtml(rawContent)
      : rawContent

    const formNumber = (metadata?.formNumber as string) ?? extractFormNumber(text)
    const taxYear = extractTaxYear(text)
    const revisionDate = (metadata?.revisionDate as string) ?? extractRevisionDate(text)
    const isPub = isPublication(text, formNumber)

    const label = isPub
      ? `Publication ${formNumber.replace(/^p/, '')}`
      : `Form ${formNumber}`
    const title = `${label}${taxYear ? ` (${taxYear})` : ''}`

    // Build sections from the document
    const sections = this.buildSections(text, formNumber, taxYear, revisionDate, isPub, metadata)

    // Extract all citations
    const extracted = extractCitations(text)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title,
      sourceType: isPub ? 'irs_publication' : 'irs_form',
    }
  }

  /**
   * Build structured sections from the document text.
   */
  private buildSections(
    text: string,
    formNumber: string,
    taxYear: string,
    revisionDate: string,
    isPub: boolean,
    metadata?: Record<string, unknown>
  ): ParsedSection[] {
    const sections: ParsedSection[] = []

    // Find section boundaries
    const found: Array<{ name: string; index: number }> = []

    for (const pattern of INSTRUCTION_SECTION_PATTERNS) {
      const match = pattern.re.exec(text)
      if (match) {
        found.push({ name: pattern.name, index: match.index })
      }
    }

    found.sort((a, b) => a.index - b.index)

    const baseMetadata = {
      formNumber,
      taxYear,
      revisionDate,
      isPublication: isPub,
      ...(metadata ?? {}),
    }

    if (found.length === 0) {
      // No section boundaries found — create a single section
      sections.push(this.createSection(
        isPub ? `Publication ${formNumber.replace(/^p/, '')}` : `Form ${formNumber}`,
        text,
        formNumber,
        'full_document',
        baseMetadata
      ))
    } else {
      // If there is content before the first section, add it as a preamble
      if (found[0].index > 100) {
        const preambleText = text.slice(0, found[0].index).trim()
        if (preambleText.length > 50) {
          sections.push(this.createSection(
            'Overview',
            preambleText,
            formNumber,
            'overview',
            baseMetadata
          ))
        }
      }

      for (let i = 0; i < found.length; i++) {
        const { name, index } = found[i]
        const nextIndex = i + 1 < found.length ? found[i + 1].index : text.length
        const sectionText = text.slice(index, nextIndex).trim()

        // Build a display title from the section name
        const displayTitle = name
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')

        sections.push(this.createSection(
          displayTitle,
          sectionText,
          formNumber,
          name,
          baseMetadata
        ))
      }
    }

    return sections
  }

  /**
   * Create a single ParsedSection for a form/publication segment.
   */
  private createSection(
    title: string,
    content: string,
    formNumber: string,
    sectionType: string,
    baseMetadata: Record<string, unknown>
  ): ParsedSection {
    const crossRefs = extractCitations(content)

    return {
      title,
      citationString: formNumber ? `IRS ${formNumber}` : '',
      normalizedCitation: formNumber ? `form:${formNumber}` : '',
      content,
      children: [],
      metadata: {
        ...baseMetadata,
        sectionType,
        crossReferences: crossRefs.map((c) => c.normalized),
      },
      authorityTier: AUTHORITY_TIER,
      precedentialStatus: PRECEDENTIAL_STATUS,
    }
  }
}
