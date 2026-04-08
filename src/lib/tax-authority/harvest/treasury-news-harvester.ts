/**
 * Treasury Press Releases Harvester — fetches Treasury Department NOTICEs
 * from the Federal Register API.
 *
 * The Treasury website itself blocks scrapers, so we use the public
 * Federal Register API filtered to Treasury Department NOTICE documents
 * (the RegHarvester already handles RULE/PRORULE types).
 *
 * Authority tier: B2 (official Treasury communications).
 */

import { BaseHarvester, type FetchedItem } from './base-harvester'

interface FederalRegisterDocument {
  document_number: string
  title: string
  type: string
  abstract?: string
  html_url: string
  publication_date: string
  effective_on?: string
  agencies: Array<{ name: string; raw_name: string }>
  citation?: string
}

interface FederalRegisterResponse {
  count: number
  results: FederalRegisterDocument[]
  next_page_url?: string
}

export class TreasuryNewsHarvester extends BaseHarvester {
  constructor() {
    super({
      sourceId: 'treasury_press',
      name: 'Treasury Press Releases',
      endpoint: 'https://www.federalregister.gov/api/v1/documents.json',
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B2',
      rateLimitMs: 1000,
      maxRetries: 3,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []
    const sinceDate = since
      ? since.toISOString().split('T')[0]
      : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const apiUrl = this.buildApiUrl(sinceDate)
    console.log(`[TreasuryNewsHarvester] Fetching from: ${apiUrl}`)

    try {
      const response = await this.rateLimitedFetch(apiUrl)
      const data: FederalRegisterResponse = await response.json()

      console.log(
        `[TreasuryNewsHarvester] API returned ${data.count} total results, ${data.results?.length ?? 0} on this page`
      )

      if (!data.results || data.results.length === 0) {
        console.log(
          `[TreasuryNewsHarvester] No Treasury NOTICE results for sinceDate=${sinceDate}`
        )
        return items
      }

      for (const doc of data.results) {
        try {
          const content = doc.abstract || doc.title

          items.push({
            sourceUrl: doc.html_url,
            title: doc.title,
            rawContent: content,
            contentType: 'text/plain',
            publicationDate: new Date(doc.publication_date),
            effectiveDate: doc.effective_on ? new Date(doc.effective_on) : undefined,
            authorityTier: 'B2',
            jurisdiction: 'federal',
            metadata: {
              documentNumber: doc.document_number,
              type: doc.type,
              abstract: doc.abstract,
              citation: doc.citation,
              agencies: doc.agencies?.map((a) => a.name),
            },
          })
        } catch (e) {
          console.error(
            `[TreasuryNewsHarvester] Failed to process ${doc.document_number}:`,
            e
          )
        }
      }

      console.log(`[TreasuryNewsHarvester] Processed ${items.length} items`)
    } catch (e) {
      console.error(
        `[TreasuryNewsHarvester] API fetch failed:`,
        e instanceof Error ? e.message : e
      )
      console.log(
        `[TreasuryNewsHarvester] Treasury direct scraping is not available. Federal Register API is the primary source.`
      )
    }

    return items
  }

  /**
   * Build URL manually — URLSearchParams over-encodes brackets
   * which the Federal Register API doesn't accept.
   * Fetches NOTICE type only (RULE/PRORULE handled by RegHarvester).
   */
  private buildApiUrl(sinceDate: string): string {
    const base = this.config.endpoint
    const params = [
      `conditions[agencies][]=treasury-department`,
      `conditions[type][]=NOTICE`,
      `conditions[publication_date][gte]=${sinceDate}`,
      `per_page=20`,
      `order=newest`,
    ].join('&')

    return `${base}?${params}`
  }
}
