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

    let pageUrl: string | null = this.buildApiUrl(sinceDate)

    while (pageUrl) {
      const response = await this.rateLimitedFetch(pageUrl)
      const data: FederalRegisterResponse = await response.json()

      for (const doc of data.results) {
        try {
          const content = await this.fetchDocumentContent(doc)
          if (!content) continue

          const tier: AuthorityTier = doc.type === 'RULE' ? 'A2' : 'A3'

          items.push({
            sourceUrl: doc.html_url,
            title: doc.title,
            rawContent: content,
            contentType: 'text/html',
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
          console.error(`[RegHarvester] Failed to fetch content for ${doc.document_number}:`, e)
        }
      }

      pageUrl = data.next_page_url ?? null
    }

    return items
  }

  private buildApiUrl(sinceDate: string): string {
    const params = new URLSearchParams({
      'conditions[agencies][]': 'treasury-department',
      'conditions[publication_date][gte]': sinceDate,
      'conditions[term]': 'tax resolution OR offer in compromise OR penalty abatement OR installment agreement OR trust fund recovery OR innocent spouse OR currently not collectible OR collection due process',
      per_page: '50',
      order: 'newest',
    })

    // Focus on CFR Title 26 parts most relevant to tax resolution practice
    const relevantCfrParts = [1, 20, 301, 601]
    const cfrParams = relevantCfrParts
      .map(part => `conditions[cfr][title]=26&conditions[cfr][part]=${part}`)
      .join('&')

    return `${FEDERAL_REGISTER_API}?${params.toString()}&conditions[type][]=RULE&conditions[type][]=PRORULE&${cfrParams}`
  }

  private async fetchDocumentContent(doc: FederalRegisterDocument): Promise<string | null> {
    const contentUrl = doc.raw_text_url || doc.body_html_url
    if (!contentUrl) return doc.abstract || null

    try {
      const response = await this.rateLimitedFetch(contentUrl)
      return await response.text()
    } catch {
      return doc.abstract || null
    }
  }
}
