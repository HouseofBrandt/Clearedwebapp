/**
 * Taxpayer Advocate Service Harvester — attempts to fetch directives
 * and reports from the TAS RSS feed.
 *
 * Since the TAS site may block automated requests, this harvester
 * degrades gracefully: if the fetch fails, it logs the issue and
 * returns an empty result set.
 *
 * Authority tier: B1 (TAS directives are official IRS guidance).
 */

import { BaseHarvester, type FetchedItem } from './base-harvester'

export class TasHarvester extends BaseHarvester {
  constructor() {
    super({
      sourceId: 'taxpayer_advocate',
      name: 'Taxpayer Advocate Service',
      endpoint: 'https://www.taxpayeradvocate.irs.gov/news/feed/',
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B1',
      rateLimitMs: 2000,
      maxRetries: 2,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []
    const sinceDate = since ?? new Date(Date.now() - 7 * 86400000)

    console.log(`[TasHarvester] Attempting to fetch TAS feed from: ${this.config.endpoint}`)

    try {
      const response = await this.rateLimitedFetch(this.config.endpoint, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, text/html' },
      })
      const body = await response.text()

      // Check if we got XML (RSS feed) or something else
      if (!body.includes('<rss') && !body.includes('<feed') && !body.includes('<item')) {
        console.log(
          `[TasHarvester] Response does not appear to be an RSS feed. TAS may not offer an RSS endpoint. Gracefully returning empty.`
        )
        return items
      }

      const parsed = this.parseRssItems(body)
      console.log(`[TasHarvester] Parsed ${parsed.length} items from TAS feed`)

      for (const entry of parsed) {
        if (entry.pubDate && entry.pubDate < sinceDate) continue

        items.push({
          sourceUrl: entry.link,
          title: entry.title,
          rawContent: entry.description,
          contentType: 'text/html',
          publicationDate: entry.pubDate ?? undefined,
          authorityTier: 'B1',
          jurisdiction: 'federal',
          metadata: {
            feedSource: 'taxpayer_advocate_rss',
          },
        })
      }

      console.log(`[TasHarvester] ${items.length} items after date filtering`)
    } catch (e) {
      // Graceful degradation: TAS site may block scrapers or not have RSS
      console.warn(
        `[TasHarvester] Failed to fetch TAS feed (expected if site blocks scrapers):`,
        e instanceof Error ? e.message : e
      )
      console.log(`[TasHarvester] Returning empty result set — graceful degradation.`)
    }

    return items
  }

  /**
   * Parse RSS XML manually using regex — same approach as IrsNewsHarvester.
   * Extracts <item> elements with <title>, <link>, <description>, <pubDate>.
   */
  private parseRssItems(
    xml: string
  ): Array<{ title: string; link: string; description: string; pubDate: Date | null }> {
    const results: Array<{
      title: string
      link: string
      description: string
      pubDate: Date | null
    }> = []

    const itemRe = /<item>([\s\S]*?)<\/item>/gi
    let itemMatch: RegExpExecArray | null

    while ((itemMatch = itemRe.exec(xml)) !== null) {
      const block = itemMatch[1]

      const title = this.extractTag(block, 'title')
      const link = this.extractTag(block, 'link')
      const description = this.extractTag(block, 'description')
      const pubDateStr = this.extractTag(block, 'pubDate')

      if (!title || !link) continue

      let pubDate: Date | null = null
      if (pubDateStr) {
        const parsed = new Date(pubDateStr)
        if (!isNaN(parsed.getTime())) {
          pubDate = parsed
        }
      }

      results.push({
        title: this.stripCdata(title).trim(),
        link: this.stripCdata(link).trim(),
        description: this.stripCdata(description || '').trim(),
        pubDate,
      })
    }

    return results
  }

  private extractTag(block: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
    const match = re.exec(block)
    return match ? match[1] : null
  }

  private stripCdata(text: string): string {
    return text.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  }
}
