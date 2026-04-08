import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'
import { IRM_TARGET_SECTIONS } from '../constants'

const IRM_BASE_URL = 'https://www.irs.gov/irm'

export class IrmHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'irs_irm',
      name: 'Internal Revenue Manual',
      endpoint: IRM_BASE_URL,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B1',
      rateLimitMs: 1000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []

    for (const section of IRM_TARGET_SECTIONS) {
      try {
        const sectionItems = await this.fetchSection(section, since)
        items.push(...sectionItems)
      } catch (e) {
        console.error(`[IrmHarvester] Failed to fetch IRM ${section}:`, e)
      }
    }

    return items
  }

  private async fetchSection(section: string, since: Date | null): Promise<FetchedItem[]> {
    const parts = section.split('.')
    const sectionPath = this.buildIrmPath(parts)
    const url = `${IRM_BASE_URL}/${sectionPath}`

    const response = await this.rateLimitedFetch(url, {
      headers: { Accept: 'text/html' },
    })

    const lastModified = response.headers.get('last-modified')
    const etag = response.headers.get('etag')

    if (since && lastModified) {
      const modifiedDate = new Date(lastModified)
      if (modifiedDate <= since) return []
    }

    const html = await response.text()

    return [
      {
        sourceUrl: url,
        title: `IRM ${section}`,
        rawContent: html,
        contentType: 'text/html',
        publicationDate: lastModified ? new Date(lastModified) : undefined,
        jurisdiction: 'federal',
        metadata: {
          section,
          part: parts[0],
          etag,
          lastModified,
        },
      },
    ]
  }

  private buildIrmPath(parts: string[]): string {
    const partNum = parts[0]
    const padded = parts.map((p) => p.padStart(3, '0'))
    return `part${partNum}/irm_${padded.join('-')}`
  }
}
