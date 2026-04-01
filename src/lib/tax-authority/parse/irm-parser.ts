/**
 * IRM Parser — parses IRS Internal Revenue Manual HTML pages into structured
 * ParsedSections.
 *
 * IRM pages on irs.gov typically have:
 *   - Main content inside a div with class "field-items" or "field--item"
 *   - Section headers as h2/h3/h4 with IRM section numbers (e.g., "5.8.4.3")
 *   - Nested subsection structure following IRM numbering
 *
 * All sections are tier B1 (internal IRS guidance) with INFORMATIONAL status.
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTHORITY_TIER = 'B1' as const
const PRECEDENTIAL_STATUS = 'INFORMATIONAL' as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip HTML tags, decode common entities, collapse whitespace. */
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

/**
 * Extract the main content area from an IRM HTML page, stripping navigation,
 * headers, footers, and sidebars.
 */
function extractMainContent(html: string): string {
  // Try common irs.gov content wrappers in order of specificity
  const contentPatterns = [
    // Drupal field-items wrapper (most common on irs.gov)
    /<div[^>]*class="[^"]*field--item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i,
    /<div[^>]*class="[^"]*field-items?[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i,
    // Main content area
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // Article body
    /<article[^>]*>([\s\S]*?)<\/article>/i,
  ]

  for (const pattern of contentPatterns) {
    const match = pattern.exec(html)
    if (match && match[1] && match[1].trim().length > 200) {
      return match[1]
    }
  }

  // If none of the wrappers matched, strip obvious non-content elements
  // and return the body
  let content = html
  // Remove <head>
  content = content.replace(/<head[\s\S]*?<\/head>/gi, '')
  // Remove nav/header/footer/aside
  content = content.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, '')
  // Remove script/style
  content = content.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')

  return content
}

/**
 * IRM section number pattern: e.g., "5.8.4.3", "1.2.3", "5.8.4.3.1"
 */
const IRM_SECTION_RE = /(\d+(?:\.\d+){1,6})/

/**
 * Match a heading tag that contains an IRM section number.
 * Captures: (1) heading level tag, (2) full heading inner HTML
 */
const HEADING_RE = /<(h[2-6])[^>]*>([\s\S]*?)<\/\1>/gi

interface IrmHeading {
  level: number
  sectionNumber: string | null
  title: string
  rawTitle: string
  index: number
}

/** Parse headings from the content and extract IRM section numbers. */
function parseHeadings(html: string): IrmHeading[] {
  const headings: IrmHeading[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(HEADING_RE.source, HEADING_RE.flags)

  while ((match = re.exec(html)) !== null) {
    const level = parseInt(match[1].charAt(1), 10)
    const rawTitle = match[2]
    const plainTitle = stripHtml(rawTitle)

    // Try to extract IRM section number from the heading text
    const sectionMatch = IRM_SECTION_RE.exec(plainTitle)
    const sectionNumber = sectionMatch ? sectionMatch[1] : null

    headings.push({
      level,
      sectionNumber,
      title: plainTitle,
      rawTitle,
      index: match.index,
    })
  }

  return headings
}

// ─── IrmParser ───────────────────────────────────────────────────────────────

export class IrmParser extends BaseParser {
  /**
   * Parse an IRM HTML page into structured sections.
   *
   * @param rawContent — HTML string of the IRM page
   * @param metadata — optional overrides, e.g. { irmPart: '5.8.4' }
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    const mainContent = extractMainContent(rawContent)

    // Extract page title from the HTML
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawContent)
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(rawContent)
    const pageTitle = stripHtml(
      h1Match?.[1] ?? titleMatch?.[1] ?? (metadata?.title as string) ?? 'Untitled IRM Section'
    )

    // Determine the IRM part from metadata or page title
    const irmPart = (metadata?.irmPart as string) ?? this.extractIrmPart(pageTitle)

    const headings = parseHeadings(mainContent)
    const sections = this.buildSections(mainContent, headings, irmPart, metadata)

    // If no headings were found, treat the entire content as a single section
    if (sections.length === 0) {
      const bodyText = stripHtml(mainContent)
      if (bodyText.length > 0) {
        const sectionNumber = irmPart || ''
        sections.push({
          title: pageTitle,
          citationString: sectionNumber ? `IRM ${sectionNumber}` : '',
          normalizedCitation: sectionNumber ? `irm:${sectionNumber}` : '',
          content: bodyText,
          children: [],
          metadata: { irmPart },
          authorityTier: AUTHORITY_TIER,
          precedentialStatus: PRECEDENTIAL_STATUS,
        })
      }
    }

    // Collect all citations across all sections
    const allText = sections.map((s) => s.content).join(' ')
    const extracted = extractCitations(allText)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title: pageTitle,
      sourceType: 'irm',
    }
  }

  // ─── Section building ──────────────────────────────────────────────────

  private buildSections(
    html: string,
    headings: IrmHeading[],
    irmPart: string | null,
    metadata?: Record<string, unknown>,
  ): ParsedSection[] {
    if (headings.length === 0) return []

    const sections: ParsedSection[] = []

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i]
      const nextIndex = i + 1 < headings.length ? headings[i + 1].index : html.length
      const sectionHtml = html.slice(heading.index, nextIndex)
      const sectionText = stripHtml(sectionHtml)

      // Determine the IRM citation for this section
      const sectionNumber = heading.sectionNumber ?? ''
      const citationString = sectionNumber ? `IRM ${sectionNumber}` : heading.title
      const normalizedCitation = sectionNumber ? `irm:${sectionNumber}` : ''

      // Extract cross-references
      const crossRefs = extractCitations(sectionText)

      const section: ParsedSection = {
        title: heading.title,
        citationString,
        normalizedCitation,
        content: sectionText,
        children: [],
        metadata: {
          headingLevel: heading.level,
          irmPart,
          sectionNumber,
          crossReferences: crossRefs.map((c) => c.normalized),
          ...(metadata ?? {}),
        },
        authorityTier: AUTHORITY_TIER,
        precedentialStatus: PRECEDENTIAL_STATUS,
      }

      sections.push(section)
    }

    // Build parent-child hierarchy based on heading levels
    return this.nestSections(sections, headings)
  }

  /**
   * Nest sections into a tree based on heading levels.
   * h2 sections are top-level, h3 become children of the preceding h2, etc.
   */
  private nestSections(sections: ParsedSection[], headings: IrmHeading[]): ParsedSection[] {
    if (sections.length === 0) return []

    const result: ParsedSection[] = []
    const stack: Array<{ section: ParsedSection; level: number }> = []

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const level = headings[i].level

      // Pop stack until we find a parent with a lower heading level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      if (stack.length === 0) {
        // Top-level section
        result.push(section)
      } else {
        // Child of the section on top of the stack
        stack[stack.length - 1].section.children.push(section)
      }

      stack.push({ section, level })
    }

    return result
  }

  // ─── Utility ───────────────────────────────────────────────────────────

  /**
   * Try to extract the IRM part number from a page title.
   * E.g., "5.8.4 Offer in Compromise" → "5.8.4"
   */
  private extractIrmPart(title: string): string | null {
    const match = IRM_SECTION_RE.exec(title)
    return match ? match[1] : null
  }
}
