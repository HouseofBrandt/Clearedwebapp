/**
 * Tax Court Harvester — fetches U.S. Tax Court opinions from the
 * public case information page.
 *
 * Opinion types and their weight sub-tiers (all tier A5):
 *   - Reviewed by full court: 0.96
 *   - Regular (division): 0.93
 *   - Memorandum: 0.88
 *   - Summary: 0.85
 *
 * Rate limited to 2000ms between requests per the source policy.
 */

import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'
import { TAX_COURT_WEIGHTS } from '../constants'

const TAX_COURT_URL = 'https://www.ustaxcourt.gov/public-case-information/opinions'

/**
 * Opinion types as they appear on the Tax Court website.
 */
type OpinionType = 'reviewed' | 'regular' | 'memorandum' | 'summary'

interface OpinionMetadata {
  caseName: string
  docketNumber: string
  judge: string
  date: string
  opinionType: OpinionType
  pdfUrl?: string
}

/** Map opinion type strings found on the page to our canonical types. */
function classifyOpinionType(typeStr: string): OpinionType {
  const lower = typeStr.toLowerCase().trim()
  if (lower.includes('reviewed') || lower.includes('full court')) return 'reviewed'
  if (lower.includes('memo')) return 'memorandum'
  if (lower.includes('summary') || lower.includes('s opinion')) return 'summary'
  return 'regular'
}

/** Get the weight sub-tier for an opinion type. */
function getSubTierWeight(opinionType: OpinionType): number {
  switch (opinionType) {
    case 'reviewed':
      return TAX_COURT_WEIGHTS.REVIEWED_FULL_COURT
    case 'regular':
      return TAX_COURT_WEIGHTS.REGULAR
    case 'memorandum':
      return TAX_COURT_WEIGHTS.MEMORANDUM
    case 'summary':
      return TAX_COURT_WEIGHTS.SUMMARY
  }
}

/**
 * Parse opinion listings from the Tax Court opinions HTML page.
 * The page typically lists opinions in a table or structured list
 * with columns: case name, docket, judge, date, type, PDF link.
 */
function parseOpinionListings(html: string): OpinionMetadata[] {
  const opinions: OpinionMetadata[] = []

  // Match table rows containing opinion data
  // Tax Court pages typically use <tr> rows with <td> cells
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  const linkRe = /<a[^>]*href="([^"]*\.pdf)"[^>]*>/i

  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    const cellReLocal = new RegExp(cellRe.source, cellRe.flags)

    while ((cellMatch = cellReLocal.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1])
    }

    // Skip header rows or rows with too few cells
    if (cells.length < 4) continue

    // Extract plain text from each cell
    const stripHtml = (s: string) =>
      s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    const caseName = stripHtml(cells[0])
    const docketNumber = stripHtml(cells[1])

    // Skip if this looks like a header row
    if (
      caseName.toLowerCase().includes('case name') ||
      docketNumber.toLowerCase().includes('docket')
    ) {
      continue
    }

    const judge = cells.length > 2 ? stripHtml(cells[2]) : ''
    const dateStr = cells.length > 3 ? stripHtml(cells[3]) : ''
    const typeStr = cells.length > 4 ? stripHtml(cells[4]) : 'Regular'

    // Look for a PDF link in the row
    const pdfMatch = linkRe.exec(rowHtml)
    const pdfUrl = pdfMatch ? pdfMatch[1] : undefined

    opinions.push({
      caseName,
      docketNumber,
      judge,
      date: dateStr,
      opinionType: classifyOpinionType(typeStr),
      pdfUrl,
    })
  }

  return opinions
}

export class TaxCourtHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'ustc_opinions',
      name: 'U.S. Tax Court Opinions',
      endpoint: TAX_COURT_URL,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'A5',
      rateLimitMs: 2000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []

    // Fetch the main opinions listing page
    const response = await this.rateLimitedFetch(TAX_COURT_URL, {
      headers: { Accept: 'text/html' },
    })
    const html = await response.text()

    const opinions = parseOpinionListings(html)

    for (const opinion of opinions) {
      try {
        // Parse the date and filter by "since"
        const opinionDate = this.parseDate(opinion.date)
        if (since && opinionDate && opinionDate <= since) continue

        const content = await this.fetchOpinionContent(opinion)
        if (!content) continue

        const subTierWeight = getSubTierWeight(opinion.opinionType)

        items.push({
          sourceUrl: opinion.pdfUrl ?? TAX_COURT_URL,
          title: `${opinion.caseName} (${opinion.docketNumber})`,
          rawContent: content,
          contentType: opinion.pdfUrl ? 'application/pdf' : 'text/html',
          publicationDate: opinionDate ?? undefined,
          authorityTier: 'A5',
          jurisdiction: 'federal',
          metadata: {
            caseName: opinion.caseName,
            docketNumber: opinion.docketNumber,
            judge: opinion.judge,
            opinionType: opinion.opinionType,
            subTierWeight,
            pdfUrl: opinion.pdfUrl,
          },
        })
      } catch (e) {
        console.error(
          `[TaxCourtHarvester] Failed to fetch opinion ${opinion.caseName}:`,
          e
        )
      }
    }

    return items
  }

  /**
   * Fetch the full opinion content. If a PDF URL is available, fetch the raw
   * PDF bytes as a base64 string. Otherwise, use the listing page content.
   */
  private async fetchOpinionContent(opinion: OpinionMetadata): Promise<string | null> {
    if (opinion.pdfUrl) {
      try {
        const pdfUrl = opinion.pdfUrl.startsWith('http')
          ? opinion.pdfUrl
          : `https://www.ustaxcourt.gov${opinion.pdfUrl}`

        const response = await this.rateLimitedFetch(pdfUrl)
        const buffer = await response.arrayBuffer()
        // Store raw PDF as base64 — the parser will extract text
        return Buffer.from(buffer).toString('base64')
      } catch {
        // Fall back to metadata-only content
        return this.buildMetadataContent(opinion)
      }
    }

    return this.buildMetadataContent(opinion)
  }

  /**
   * Build a text representation from the opinion metadata when PDF
   * is not available.
   */
  private buildMetadataContent(opinion: OpinionMetadata): string {
    return [
      `Case: ${opinion.caseName}`,
      `Docket: ${opinion.docketNumber}`,
      `Judge: ${opinion.judge}`,
      `Date: ${opinion.date}`,
      `Type: ${opinion.opinionType}`,
    ].join('\n')
  }

  /**
   * Parse a date string from the Tax Court page. Handles common formats
   * like "01/15/2025", "January 15, 2025", "2025-01-15".
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  }
}
