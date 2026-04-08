import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'
import type { AuthorityTier } from '../types'

const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json'

interface FederalRegisterDocument {
  document_number: string
  title: string
  type: string
  abstract?: string
  html_url: string
  raw_text_url?: string
  body_html_url?: string
  publication_date: string
  effective_on?: string
  agencies: Array<{ name: string; raw_name: string }>
  cfr_references?: Array<{ title: number; part: number }>
  citation?: string
  regulation_id_numbers?: Array<{ regulation_id_number: string }>
}

interface FederalRegisterResponse {
  count: number
  results: FederalRegisterDocument[]
  next_page_url?: string
}

export class RegHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'treas_reg_cfr26',
      name: 'Treasury Regulations (Federal Register)',
      endpoint: FEDERAL_REGISTER_API,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'A2',
      rateLimitMs: 1000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []
    const sinceDate = since
      ? since.toISOString().split('T')[0]
      : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const apiUrl = this.buildApiUrl(sinceDate)
    console.log(`[RegHarvester] Fetching from: ${apiUrl}`)

    try {
      const response = await this.rateLimitedFetch(apiUrl)
      const data: FederalRegisterResponse = await response.json()

      console.log(`[RegHarvester] API returned ${data.count} total results, ${data.results?.length ?? 0} on this page`)

      if (!data.results || data.results.length === 0) {
        console.log(`[RegHarvester] No results for sinceDate=${sinceDate}`)
        return items
      }

      for (const doc of data.results) {
        try {
          // Use abstract as content to avoid slow per-document fetches
          const content = doc.abstract || doc.title
          const tier: AuthorityTier = doc.type === 'RULE' ? 'A2' : 'A3'

          items.push({
            sourceUrl: doc.html_url,
            title: doc.title,
            rawContent: content,
            contentType: 'text/plain',
            publicationDate: new Date(doc.publication_date),
            effectiveDate: doc.effective_on ? new Date(doc.effective_on) : undefined,
            authorityTier: tier,
            jurisdiction: 'federal',
            metadata: {
              documentNumber: doc.document_number,
              type: doc.type,
              abstract: doc.abstract,
              cfrReferences: doc.cfr_references,
              citation: doc.citation,
              regulationIds: doc.regulation_id_numbers,
            },
          })
        } catch (e) {
          console.error(`[RegHarvester] Failed to process ${doc.document_number}:`, e)
        }
      }

      console.log(`[RegHarvester] Processed ${items.length} items`)
    } catch (e) {
      console.error(`[RegHarvester] API fetch failed:`, e instanceof Error ? e.message : e)
    }

    return items
  }

  private buildApiUrl(sinceDate: string): string {
    // Build URL manually — URLSearchParams over-encodes brackets
    // which the Federal Register API doesn't accept
    const base = FEDERAL_REGISTER_API
    const params = [
      `conditions[agencies][]=treasury-department`,
      `conditions[publication_date][gte]=${sinceDate}`,
      `conditions[type][]=RULE`,
      `conditions[type][]=PRORULE`,
      `per_page=20`,
      `order=newest`,
    ].join('&')

    return `${base}?${params}`
  }
}
