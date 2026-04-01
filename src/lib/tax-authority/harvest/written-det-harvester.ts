/**
 * Written Determinations Harvester — fetches PLRs, CCAs, and TAMs from
 * the IRS Written Determinations page.
 *
 * CRITICAL: Every item ingested by this harvester MUST have:
 *   - authorityTier: C1
 *   - metadata.precedentialStatus: NONPRECEDENTIAL
 *
 * Written determinations are published redacted versions of private
 * guidance. They may NOT be cited as precedent (IRC § 6110(k)(3)).
 */

import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'

const WRITTEN_DET_URL = 'https://www.irs.gov/written-determinations'

/** Document type classification. */
type WrittenDetType = 'PLR' | 'CCA' | 'TAM' | 'UNKNOWN'

interface WrittenDetListing {
  documentNumber: string
  title: string
  type: WrittenDetType
  date: string
  url: string
}

/** Classify a written determination by its document number prefix or title. */
function classifyDocType(docNumber: string, title: string): WrittenDetType {
  const lower = title.toLowerCase()
  if (lower.includes('chief counsel') || lower.includes('cca')) return 'CCA'
  if (lower.includes('technical advice') || lower.includes('tam')) return 'TAM'
  if (lower.includes('private letter') || lower.includes('plr')) return 'PLR'

  // PLR numbers are typically 9+ digits starting with the year
  if (/^\d{9,}$/.test(docNumber)) return 'PLR'

  return 'UNKNOWN'
}

/**
 * Parse written determination listings from the IRS page HTML.
 */
function parseListings(html: string): WrittenDetListing[] {
  const listings: WrittenDetListing[] = []
  const seen = new Set<string>()

  // IRS written determinations page uses links to individual documents
  // Pattern: <a href="/written-determinations/..." >PLR 202301001</a> or similar
  const linkRe =
    /<a[^>]*href="(\/written-determinations\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) !== null) {
    const relativeUrl = match[1]
    const linkText = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!linkText) continue

    // Extract document number from the link text or URL
    const docNumMatch = /(\d{9,})/.exec(linkText) ?? /(\d{9,})/.exec(relativeUrl)
    const documentNumber = docNumMatch ? docNumMatch[1] : linkText

    if (seen.has(documentNumber)) continue
    seen.add(documentNumber)

    const docType = classifyDocType(documentNumber, linkText)

    listings.push({
      documentNumber,
      title: linkText,
      type: docType,
      date: '',
      url: relativeUrl,
    })
  }

  // Also try to find date information from the surrounding context
  // Many IRS pages list dates near the document links
  const dateRe = /(\d{1,2}\/\d{1,2}\/\d{4})/g
  const dates: string[] = []
  let dateMatch: RegExpExecArray | null
  while ((dateMatch = dateRe.exec(html)) !== null) {
    dates.push(dateMatch[1])
  }

  return listings
}

export class WrittenDetHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'irs_written_determinations',
      name: 'Written Determinations (PLRs, CCAs, TAMs)',
      endpoint: WRITTEN_DET_URL,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'C1',
      rateLimitMs: 1000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []

    // Fetch the main listings page
    const response = await this.rateLimitedFetch(WRITTEN_DET_URL, {
      headers: { Accept: 'text/html' },
    })
    const html = await response.text()

    const listings = parseListings(html)

    // Filter to only new documents not already ingested
    const newListings = await this.filterNewDocuments(listings)

    for (const listing of newListings) {
      try {
        const content = await this.fetchDocument(listing)
        if (!content) continue

        const publicationDate = listing.date ? new Date(listing.date) : undefined

        // CRITICAL: Every item MUST be C1 and NONPRECEDENTIAL
        items.push({
          sourceUrl: `https://www.irs.gov${listing.url}`,
          title: listing.title,
          rawContent: content,
          contentType: 'text/html',
          publicationDate: publicationDate && !isNaN(publicationDate.getTime())
            ? publicationDate
            : undefined,
          authorityTier: 'C1', // ALWAYS C1 — non-precedential
          jurisdiction: 'federal',
          metadata: {
            documentNumber: listing.documentNumber,
            documentType: listing.type,
            precedentialStatus: 'NONPRECEDENTIAL', // CRITICAL: always non-precedential
            ircSection6110k3: true, // Cannot be cited as precedent
          },
        })
      } catch (e) {
        console.error(
          `[WrittenDetHarvester] Failed to fetch ${listing.documentNumber}:`,
          e
        )
      }
    }

    return items
  }

  /**
   * Filter listings to only those with document numbers not already stored.
   */
  private async filterNewDocuments(
    listings: WrittenDetListing[]
  ): Promise<WrittenDetListing[]> {
    const newListings: WrittenDetListing[] = []

    for (const listing of listings) {
      try {
        const { prisma } = await import('@/lib/db')
        const existing = await prisma.sourceArtifact.findFirst({
          where: {
            sourceId: this.config.sourceId,
            normalizedTitle: listing.title,
          },
        })
        if (!existing) {
          newListings.push(listing)
        }
      } catch {
        // If DB is unavailable, fetch all and let storeArtifact deduplicate
        newListings.push(listing)
      }
    }

    return newListings
  }

  /**
   * Fetch the full content of a written determination document page.
   */
  private async fetchDocument(listing: WrittenDetListing): Promise<string | null> {
    const url = `https://www.irs.gov${listing.url}`

    try {
      const response = await this.rateLimitedFetch(url, {
        headers: { Accept: 'text/html' },
      })
      return await response.text()
    } catch (e) {
      console.error(
        `[WrittenDetHarvester] Failed to fetch document at ${url}:`,
        e
      )
      return null
    }
  }
}
