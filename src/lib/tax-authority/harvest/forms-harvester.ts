/**
 * Forms Harvester — fetches IRS Forms, Instructions, and Publications
 * from the IRS website.
 *
 * Only ingests forms/publications from the curated lists defined in
 * constants.ts (CURATED_FORMS and CURATED_PUBLICATIONS). Tracks revision
 * dates to detect updates to previously ingested items.
 *
 * Authority tier: B2 (official IRS forms and publications).
 */

import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'
import { CURATED_FORMS, CURATED_PUBLICATIONS } from '../constants'

const FORMS_BASE_URL = 'https://www.irs.gov/forms-instructions'
const PUBS_BASE_URL = 'https://www.irs.gov/publications'

/** IRS forms search API endpoint for structured lookup. */
const FORMS_SEARCH_URL = 'https://apps.irs.gov/app/picklist/list/priorFormPublication.html'

interface FormListing {
  formNumber: string
  title: string
  revisionDate: string
  pdfUrl: string
  isPublication: boolean
}

/**
 * Parse form/publication listings from IRS HTML search results.
 */
function parseFormListings(html: string, isPublication: boolean): FormListing[] {
  const listings: FormListing[] = []

  // IRS form listing pages use table rows with form data
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  const linkRe = /<a[^>]*href="([^"]*\.pdf)"[^>]*>([\s\S]*?)<\/a>/i

  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    const cellReLocal = new RegExp(cellRe.source, cellRe.flags)

    while ((cellMatch = cellReLocal.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1])
    }

    if (cells.length < 2) continue

    const stripHtml = (s: string) =>
      s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    // Extract PDF link from the first cell
    const pdfMatch = linkRe.exec(cells[0])
    const formNumber = stripHtml(pdfMatch ? pdfMatch[2] : cells[0])
    const pdfUrl = pdfMatch ? pdfMatch[1] : ''

    // Skip header rows
    if (
      formNumber.toLowerCase().includes('product number') ||
      formNumber.toLowerCase().includes('form number')
    ) {
      continue
    }

    const title = cells.length > 1 ? stripHtml(cells[1]) : formNumber
    const revisionDate = cells.length > 2 ? stripHtml(cells[2]) : ''

    listings.push({
      formNumber,
      title,
      revisionDate,
      pdfUrl,
      isPublication,
    })
  }

  return listings
}

export class FormsHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'irs_forms_pubs',
      name: 'IRS Forms, Instructions & Publications',
      endpoint: FORMS_BASE_URL,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B2',
      rateLimitMs: 1000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []

    // Fetch curated forms
    for (const formNumber of CURATED_FORMS) {
      try {
        const formItems = await this.fetchForm(formNumber, false)
        // Filter to only changed items (new revision dates)
        for (const item of formItems) {
          const isNew = await this.isNewOrUpdated(item, since)
          if (isNew) {
            items.push(item)
          }
        }
      } catch (e) {
        console.error(`[FormsHarvester] Failed to fetch Form ${formNumber}:`, e)
      }
    }

    // Fetch curated publications
    for (const pubNumber of CURATED_PUBLICATIONS) {
      try {
        const pubItems = await this.fetchForm(pubNumber, true)
        for (const item of pubItems) {
          const isNew = await this.isNewOrUpdated(item, since)
          if (isNew) {
            items.push(item)
          }
        }
      } catch (e) {
        console.error(`[FormsHarvester] Failed to fetch Pub ${pubNumber}:`, e)
      }
    }

    return items
  }

  /**
   * Fetch a specific form or publication from the IRS website.
   */
  private async fetchForm(
    formNumber: string,
    isPublication: boolean
  ): Promise<FetchedItem[]> {
    const prefix = isPublication ? 'p' : ''
    const searchValue = isPublication ? `${prefix}${formNumber}` : `Form ${formNumber}`

    // Try the forms search/listing page
    const url = isPublication
      ? `${PUBS_BASE_URL}/p${formNumber}`
      : `${FORMS_BASE_URL}/about-form-${formNumber.toLowerCase()}`

    try {
      const response = await this.rateLimitedFetch(url, {
        headers: { Accept: 'text/html' },
      })
      const html = await response.text()

      // Try to find PDF links on the page
      const pdfLinks = this.extractPdfLinks(html, formNumber, isPublication)

      if (pdfLinks.length > 0) {
        const items: FetchedItem[] = []
        for (const link of pdfLinks) {
          const content = await this.fetchPdfContent(link.url)
          if (!content) continue

          const label = isPublication ? `Publication ${formNumber}` : `Form ${formNumber}`

          items.push({
            sourceUrl: link.url,
            title: `${label}${link.suffix ? ` ${link.suffix}` : ''}`,
            rawContent: content,
            contentType: 'application/pdf',
            publicationDate: link.revisionDate
              ? new Date(link.revisionDate)
              : undefined,
            authorityTier: 'B2',
            jurisdiction: 'federal',
            metadata: {
              formNumber,
              isPublication,
              revisionDate: link.revisionDate,
              documentType: isPublication ? 'publication' : 'form',
            },
          })
        }
        return items
      }

      // Fallback: store the HTML "about" page itself
      const label = isPublication ? `Publication ${formNumber}` : `Form ${formNumber}`
      return [
        {
          sourceUrl: url,
          title: label,
          rawContent: html,
          contentType: 'text/html',
          authorityTier: 'B2',
          jurisdiction: 'federal',
          metadata: {
            formNumber,
            isPublication,
            documentType: isPublication ? 'publication' : 'form',
          },
        },
      ]
    } catch (e) {
      console.error(
        `[FormsHarvester] Failed to fetch ${isPublication ? 'Pub' : 'Form'} ${formNumber}:`,
        e
      )
      return []
    }
  }

  /**
   * Extract PDF links from a form/publication page.
   */
  private extractPdfLinks(
    html: string,
    formNumber: string,
    isPublication: boolean
  ): Array<{ url: string; suffix: string; revisionDate?: string }> {
    const links: Array<{ url: string; suffix: string; revisionDate?: string }> = []
    const seen = new Set<string>()

    // Match PDF links
    const pdfRe = /<a[^>]*href="(https?:\/\/[^"]*\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null

    while ((match = pdfRe.exec(html)) !== null) {
      const pdfUrl = match[1]
      const linkText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

      if (seen.has(pdfUrl)) continue
      seen.add(pdfUrl)

      // Determine if this is an instruction or the form itself
      const lowerText = linkText.toLowerCase()
      let suffix = ''
      if (lowerText.includes('instruction')) {
        suffix = '(Instructions)'
      }

      // Try to extract revision date from nearby text
      const dateMatch = /(\d{1,2}\/\d{4})|([A-Z][a-z]+\s+\d{4})/.exec(linkText)
      const revisionDate = dateMatch ? dateMatch[0] : undefined

      links.push({ url: pdfUrl, suffix, revisionDate })
    }

    return links
  }

  /**
   * Fetch PDF content as base64 for storage.
   */
  private async fetchPdfContent(url: string): Promise<string | null> {
    try {
      const response = await this.rateLimitedFetch(url)
      const buffer = await response.arrayBuffer()
      return Buffer.from(buffer).toString('base64')
    } catch {
      return null
    }
  }

  /**
   * Check if a fetched item is new or has been updated since the last harvest.
   * Compares revision dates stored in metadata.
   */
  private async isNewOrUpdated(
    item: FetchedItem,
    since: Date | null
  ): Promise<boolean> {
    if (!since) return true

    // If the item has a publication/revision date newer than 'since', it's new
    if (item.publicationDate && item.publicationDate > since) return true

    // Check if we already have this exact title
    try {
      const { prisma } = await import('@/lib/db')
      const existing = await prisma.sourceArtifact.findFirst({
        where: {
          sourceId: this.config.sourceId,
          normalizedTitle: item.title,
        },
        orderBy: { fetchedAt: 'desc' },
      })

      if (!existing) return true

      // Check if revision date has changed
      const existingRevDate = (existing.metadata as Record<string, unknown>)?.revisionDate
      const newRevDate = (item.metadata as Record<string, unknown>)?.revisionDate

      if (existingRevDate !== newRevDate) return true

      return false
    } catch {
      // If DB is unavailable, fetch all and let storeArtifact deduplicate
      return true
    }
  }
}
