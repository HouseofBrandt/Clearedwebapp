/**
 * Reg Parser — parses Federal Register JSON/HTML documents (Treasury
 * Regulations / 26 C.F.R.) into structured ParsedSections.
 *
 * Handles two input formats:
 *   1. Federal Register API JSON (federalregister.gov)
 *   2. Raw HTML from Federal Register pages
 *
 * Final rules are marked A2 / BINDING.
 * Proposed rules (NPRMs) are marked A3 / AUTHORITATIVE.
 */

import { BaseParser, type ParseResult, type ParsedSection } from './base-parser'
import { extractCitations } from './citation-extractor'
import type { AuthorityTier, PrecedentialStatus } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip HTML tags, collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract text content from inside an HTML element by tag. */
function extractTagContent(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1])
  }
  return matches
}

/** Determine if a Federal Register document type represents a final rule. */
function isFinalRule(docType: string | undefined): boolean {
  if (!docType) return true // default assumption
  const lower = docType.toLowerCase()
  return lower.includes('final') || lower.includes('rule') && !lower.includes('proposed')
}

/** Pick the authority tier and precedential status based on doc type. */
function classifyRule(docType: string | undefined): { tier: AuthorityTier; status: PrecedentialStatus } {
  if (!docType) return { tier: 'A2', status: 'BINDING' }
  const lower = docType.toLowerCase()
  if (lower.includes('proposed') || lower.includes('nprm') || lower.includes('notice of proposed')) {
    return { tier: 'A3', status: 'AUTHORITATIVE' }
  }
  if (lower.includes('temporary')) {
    return { tier: 'A2', status: 'BINDING' }
  }
  return { tier: 'A2', status: 'BINDING' }
}

/**
 * Extract CFR section references from text, e.g., "§ 301.7122-1".
 * Returns an array of section number strings.
 */
function extractCfrSections(text: string): string[] {
  const re = /(?:§|section)\s*(\d+\.\d+[-\w]*)/gi
  const sections: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const sec = m[1]
    if (!seen.has(sec)) {
      seen.add(sec)
      sections.push(sec)
    }
  }
  return sections
}

// ─── Federal Register JSON shape (subset) ────────────────────────────────────

interface FederalRegisterJson {
  title?: string
  type?: string // "Rule", "Proposed Rule", etc.
  document_number?: string
  publication_date?: string
  effective_on?: string
  abstract?: string
  body_html_url?: string
  full_text_xml_url?: string
  raw_text_url?: string
  cfr_references?: Array<{
    title?: number
    part?: number
    chapter?: string
  }>
  html_url?: string
  // We also accept a pre-fetched body:
  body_html?: string
}

// ─── RegParser ───────────────────────────────────────────────────────────────

export class RegParser extends BaseParser {
  /**
   * Parse a Federal Register document into structured sections.
   *
   * @param rawContent — either a JSON string (Federal Register API response)
   *   or raw HTML of the document page.
   * @param metadata — optional overrides (e.g., { docType: 'Proposed Rule' }).
   */
  async parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    // Attempt to detect JSON vs HTML
    const trimmed = rawContent.trimStart()
    if (trimmed.startsWith('{')) {
      return this.parseJson(rawContent, metadata)
    }
    return this.parseHtml(rawContent, metadata)
  }

  // ─── JSON parsing (Federal Register API) ─────────────────────────────────

  private async parseJson(raw: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    let doc: FederalRegisterJson
    try {
      doc = JSON.parse(raw) as FederalRegisterJson
    } catch {
      // If JSON parse fails, fall through to HTML parsing
      return this.parseHtml(raw, metadata)
    }

    const docType = (metadata?.docType as string) ?? doc.type
    const { tier, status } = classifyRule(docType)

    const title = doc.title ?? 'Untitled Federal Register Document'
    const publicationDate = doc.publication_date ? new Date(doc.publication_date) : undefined
    const effectiveDate = doc.effective_on ? new Date(doc.effective_on) : undefined

    const bodyHtml = doc.body_html ?? ''
    const bodyText = stripHtml(bodyHtml)

    // Build sections from the HTML body
    const sections = this.sectionsFromHtml(bodyHtml, tier, status, effectiveDate, publicationDate)

    // If we got CFR references from the API, ensure they appear as sections
    if (doc.cfr_references && doc.cfr_references.length > 0) {
      for (const ref of doc.cfr_references) {
        if (ref.title === 26 && ref.part) {
          const citation = `reg:${ref.part}`
          const alreadyPresent = sections.some(
            (s) => s.normalizedCitation.startsWith(citation)
          )
          if (!alreadyPresent) {
            sections.push({
              title: `26 C.F.R. Part ${ref.part}`,
              citationString: `26 C.F.R. Part ${ref.part}`,
              normalizedCitation: citation,
              content: '',
              children: [],
              metadata: { source: 'cfr_reference' },
              authorityTier: tier,
              precedentialStatus: status,
              effectiveDate,
              publicationDate,
            })
          }
        }
      }
    }

    // If there were no parseable sections, create a single section from the whole body
    if (sections.length === 0 && bodyText.length > 0) {
      sections.push({
        title,
        citationString: doc.document_number ?? '',
        normalizedCitation: '',
        content: bodyText,
        children: [],
        metadata: {
          documentNumber: doc.document_number,
          htmlUrl: doc.html_url,
        },
        authorityTier: tier,
        precedentialStatus: status,
        effectiveDate,
        publicationDate,
      })
    }

    // Gather all citations across all section content
    const allText = sections.map((s) => s.content).join(' ')
    const extracted = extractCitations(allText)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title,
      sourceType: isFinalRule(docType) ? 'federal_register_final' : 'federal_register_proposed',
    }
  }

  // ─── HTML parsing ────────────────────────────────────────────────────────

  private async parseHtml(raw: string, metadata?: Record<string, unknown>): Promise<ParseResult> {
    const docType = metadata?.docType as string | undefined
    const { tier, status } = classifyRule(docType)

    // Try to extract a title from <title> or <h1>
    const titleTags = extractTagContent(raw, 'title')
    const h1Tags = extractTagContent(raw, 'h1')
    const title = stripHtml(h1Tags[0] ?? titleTags[0] ?? 'Untitled Federal Register Document')

    const publicationDate = metadata?.publicationDate
      ? new Date(metadata.publicationDate as string)
      : undefined
    const effectiveDate = metadata?.effectiveDate
      ? new Date(metadata.effectiveDate as string)
      : undefined

    const sections = this.sectionsFromHtml(raw, tier, status, effectiveDate, publicationDate)

    // Fallback: single section
    if (sections.length === 0) {
      const bodyText = stripHtml(raw)
      if (bodyText.length > 0) {
        sections.push({
          title,
          citationString: '',
          normalizedCitation: '',
          content: bodyText,
          children: [],
          metadata: {},
          authorityTier: tier,
          precedentialStatus: status,
          effectiveDate,
          publicationDate,
        })
      }
    }

    const allText = sections.map((s) => s.content).join(' ')
    const extracted = extractCitations(allText)
    const citations = Array.from(new Set(extracted.map((c) => c.normalized)))

    return {
      sections,
      citations,
      title,
      sourceType: isFinalRule(docType) ? 'federal_register_final' : 'federal_register_proposed',
    }
  }

  // ─── Section extraction from HTML ────────────────────────────────────────

  /**
   * Split HTML body into sections based on heading tags (h2, h3, h4) and
   * detect CFR section references within each.
   */
  private sectionsFromHtml(
    html: string,
    tier: AuthorityTier,
    status: PrecedentialStatus,
    effectiveDate?: Date,
    publicationDate?: Date,
  ): ParsedSection[] {
    if (!html) return []

    const sections: ParsedSection[] = []

    // Split on major headings (h2, h3, h4)
    // We capture the heading tag to know the level, and the content between headings
    const headingRe = /<(h[2-4])[^>]*>([\s\S]*?)<\/\1>/gi
    const headings: Array<{ level: number; title: string; index: number }> = []
    let m: RegExpExecArray | null

    while ((m = headingRe.exec(html)) !== null) {
      headings.push({
        level: parseInt(m[1].charAt(1), 10),
        title: stripHtml(m[2]),
        index: m.index,
      })
    }

    if (headings.length === 0) return []

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i]
      const nextIndex = i + 1 < headings.length ? headings[i + 1].index : html.length
      const sectionHtml = html.slice(heading.index, nextIndex)
      const sectionText = stripHtml(sectionHtml)

      // Detect CFR references within this section
      const cfrSections = extractCfrSections(sectionText)
      const citationString = cfrSections.length > 0
        ? `26 C.F.R. § ${cfrSections[0]}`
        : ''
      const normalizedCitation = cfrSections.length > 0
        ? `reg:${cfrSections[0]}`
        : ''

      // Extract cross-references
      const citationsInSection = extractCitations(sectionText)

      sections.push({
        title: heading.title,
        citationString,
        normalizedCitation,
        content: sectionText,
        children: [],
        metadata: {
          headingLevel: heading.level,
          cfrSections,
          crossReferences: citationsInSection.map((c) => c.normalized),
        },
        authorityTier: tier,
        precedentialStatus: status,
        effectiveDate,
        publicationDate,
      })
    }

    return sections
  }
}
