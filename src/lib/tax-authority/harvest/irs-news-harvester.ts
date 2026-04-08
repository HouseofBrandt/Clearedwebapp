/**
 * IRS News RSS Harvester — parses the IRS newsroom RSS feed
 * for press releases and news items.
 *
 * Authority tier: B2 (official IRS communications, not binding guidance).
 */

import { BaseHarvester, type FetchedItem } from './base-harvester'

export class IrsNewsHarvester extends BaseHarvester {
  constructor() {
    super({
      sourceId: 'irs_news_releases',
      name: 'IRS News Releases',
      endpoint: 'https://www.irs.gov/newsroom/rss.xml',
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B2',
      rateLimitMs: 2000,
      maxRetries: 3,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []
    const sinceDate = since ?? new Date(Date.now() - 7 * 86400000)

    console.log(`[IrsNewsHarvester] Fetching RSS from: ${this.config.endpoint}`)

    try {
      const response = await this.rateLimitedFetch(this.config.endpoint, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      })
      const xml = await response.text()

      const parsed = this.parseRssItems(xml)
      console.log(`[IrsNewsHarvester] Parsed ${parsed.length} items from RSS feed`)

      for (const entry of parsed) {
        // Filter to items published since the cutoff date
        if (entry.pubDate && entry.pubDate < sinceDate) continue

        items.push({
          sourceUrl: entry.link,
          title: entry.title,
          rawContent: entry.description,
          contentType: 'text/html',
          publicationDate: entry.pubDate ?? undefined,
          authorityTier: 'B2',
          jurisdiction: 'federal',
          metadata: {
            feedSource: 'irs_newsroom_rss',
          },
        })
      }

      console.log(`[IrsNewsHarvester] ${items.length} items after date filtering`)
    } catch (e) {
      console.error(
        `[IrsNewsHarvester] RSS fetch failed:`,
        e instanceof Error ? e.message : e
      )
    }

    return items
  }

  /**
   * Parse RSS XML manually using regex — avoids adding an XML parser dependency.
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

    // Match all <item>...</item> blocks
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

  /** Extract the text content of a single XML tag from a block. */
  private extractTag(block: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
    const match = re.exec(block)
    return match ? match[1] : null
  }

  /** Strip CDATA wrappers if present. */
  private stripCdata(text: string): string {
    return text.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  }
}
