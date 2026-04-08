/**
 * IRB Parser — parses Internal Revenue Bulletin HTML into structured
 * ParsedSections, split by item type.
 *
 * Item types and their authority tiers:
 *   - Treasury Decisions (T.D.) → A3, AUTHORITATIVE
 *   - Revenue Rulings (Rev. Rul.) → A4, AUTHORITATIVE
 *   - Revenue Procedures (Rev. Proc.) → A4, AUTHORITATIVE
 *   - Notices → A4, AUTHORITATIVE
 *   - Announcements → A4, INFORMATIONAL
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'
import type { AuthorityTier, PrecedentialStatus } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── IRB item type classification ────────────────────────────────────────────

interface IrbItemType {
  type: string
  tier: AuthorityTier
  status: PrecedentialStatus
  prefix: string
}

const IRB_ITEM_TYPES: IrbItemType[] = [
  { type: 'treasury_decision', tier: 'A3', status: 'AUTHORITATIVE', prefix: 'T.D.' },
  { type: 'revenue_ruling', tier: 'A4', status: 'AUTHORITATIVE', prefix: 'Rev. Rul.' },
  { type: 'revenue_procedure', tier: 'A4', status: 'AUTHORITATIVE', prefix: 'Rev. Proc.' },
  { type: 'notice', tier: 'A4', status: 'AUTHORITATIVE', prefix: 'Notice' },
  { type: 'announcement', tier: 'A4', status: 'INFORMATIONAL', prefix: 'Announcement' },
]

/**
 * Patterns used to identify the start of each IRB item type in the HTML.
 * These patterns match headings or bold text that introduce each item.
 */
const ITEM_BOUNDARY_PATTERNS = [
  { re: /(?:Treasury\s+Decision|T\.D\.)\s+(\d+)/i, typeIndex: 0 },
  { re: /Rev(?:enue)?\.?\s*Rul(?:ing)?\.?\s*(\d{4}-\d+)/i, typeIndex: 1 },
  { re: /Rev(?:enue)?\.?\s*Proc(?:edure)?\.?\s*(\d{4}-\d+)/i, typeIndex: 2 },
  { re: /Notice\s+(\d{4}-\d+)/i, typeIndex: 3 },
  { re: /Announcement\s+(\d{4}-\d+)/i, typeIndex: 4 },
]

interface IrbItemBoundary {
  index: number
  matchEnd: number
  title: string
  number: string
  itemType: IrbItemType
}

/**
 * Find all IRB item boundaries in the HTML, sorted by their position.
 */
function findItemBoundaries(html: string): IrbItemBoundary[] {
  const boundaries: IrbItemBoundary[] = []

  for (const pattern of ITEM_BOUNDARY_PATTERNS) {
    const re = new RegExp(pattern.re.source, 'gi')
    let match: RegExpExecArray | null

    while ((match = re.exec(html)) !== null) {
      const itemType = IRB_ITEM_TYPES[pattern.typeIndex]
      const number = match[1]
      const title = `${itemType.prefix} ${number}`

      boundaries.push({
        index: match.index,
        matchEnd: match.index + match[0].length,
        title,
        number,
        itemType,
      })
    }
  }

  // Sort by position in the HTML
  boundaries.sort((a, b) => a.index - b.index)

  // Deduplicate boundaries at the same position
  const deduped: IrbItemBoundary[] = []
  for (const b of boundaries) {
    if (deduped.length === 0 || b.index !== deduped[deduped.length - 1].index) {
      deduped.push(b)
    }
  }

  return deduped
}

// ─── IRB Parser ──────────────────────────────────────────────────────────────

export class IrbParser extends BaseParser {
  /**
   * Parse an IRB HTML page into structured sections, one per item.
   *
   * @param rawContent — HTML string of the IRB bulletin page
   * @param metadata — optional overrides (e.g., { bulletinNumber: '2025-01' })
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    const bulletinNumber = (metadata?.bulletinNumber as string) ?? ''

    // Extract page title
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawContent)
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(rawContent)
    const pageTitle = stripHtml(
      h1Match?.[1] ?? titleMatch?.[1] ?? `Internal Revenue Bulletin ${bulletinNumber}`
    )

    const boundaries = findItemBoundaries(rawContent)
    const sections = this.buildSections(rawContent, boundaries, bulletinNumber, metadata)

    // If no items were found, create a single section for the whole bulletin
    if (sections.length === 0) {
      const bodyText = stripHtml(rawContent)
      if (bodyText.length > 0) {
        sections.push({
          title: pageTitle,
          citationString: bulletinNumber ? `IRB ${bulletinNumber}` : '',
          normalizedCitation: '',
          content: bodyText,
          children: [],
          metadata: { bulletinNumber },
          authorityTier: 'A4',
          precedentialStatus: 'AUTHORITATIVE',
        })
      }
    }

    // Collect all citations
    const allText = sections.map((s) => s.content).join(' ')
    const extracted = extractCitations(allText)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title: pageTitle,
      sourceType: 'irb',
    }
  }

  /**
   * Build ParsedSections from item boundaries in the HTML.
   */
  private buildSections(
    html: string,
    boundaries: IrbItemBoundary[],
    bulletinNumber: string,
    metadata?: Record<string, unknown>
  ): ParsedSection[] {
    const sections: ParsedSection[] = []

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i]
      const nextIndex = i + 1 < boundaries.length ? boundaries[i + 1].index : html.length
      const sectionHtml = html.slice(boundary.index, nextIndex)
      const sectionText = stripHtml(sectionHtml)

      // Build normalized citation
      const normalizedCitation = this.buildNormalizedCitation(boundary)

      // Extract cross-references
      const crossRefs = extractCitations(sectionText)

      sections.push({
        title: boundary.title,
        citationString: boundary.title,
        normalizedCitation,
        content: sectionText,
        children: [],
        metadata: {
          bulletinNumber,
          itemType: boundary.itemType.type,
          itemNumber: boundary.number,
          crossReferences: crossRefs.map((c) => c.normalized),
          ...(metadata ?? {}),
        },
        authorityTier: boundary.itemType.tier,
        precedentialStatus: boundary.itemType.status,
      })
    }

    return sections
  }

  /**
   * Build a normalized citation string for an IRB item.
   */
  private buildNormalizedCitation(boundary: IrbItemBoundary): string {
    switch (boundary.itemType.type) {
      case 'treasury_decision':
        return `irb:td:${boundary.number}`
      case 'revenue_ruling':
        return `irb:rev_rul:${boundary.number}`
      case 'revenue_procedure':
        return `irb:rev_proc:${boundary.number}`
      case 'notice':
        return `irb:notice:${boundary.number}`
      case 'announcement':
        return `irb:announcement:${boundary.number}`
      default:
        return ''
    }
  }
}
