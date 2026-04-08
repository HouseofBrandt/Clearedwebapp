/**
 * IRS News Harvester — fetches IRS newsroom press releases.
 *
 * The old RSS feed (/newsroom/rss.xml) no longer exists.
 * This harvester now scrapes the monthly news releases page.
 *
 * Authority tier: B2 (official IRS communications, not binding guidance).
 */

import { BaseHarvester, type FetchedItem } from './base-harvester'

// Monthly news release pages follow this pattern
function getCurrentMonthUrl(): string {
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase()
  const year = now.getFullYear()
  return `https://www.irs.gov/newsroom/news-releases-for-${month}-${year}`
}

export class IrsNewsHarvester extends BaseHarvester {
  constructor() {
    super({
      sourceId: 'irs_news_releases',
      name: 'IRS News Releases',
      endpoint: getCurrentMonthUrl(),
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'B2',
      rateLimitMs: 2000,
      maxRetries: 3,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []
    const sinceDate = since ?? new Date(Date.now() - 7 * 86400000)

    const url = getCurrentMonthUrl()
    console.log(`[IrsNewsHarvester] Fetching news from: ${url}`)

    try {
      const response = await this.rateLimitedFetch(url, {
        headers: { Accept: 'text/html' },
      })

      if (!response.ok) {
        console.warn(`[IrsNewsHarvester] Page returned ${response.status}`)
        return items
      }

      const html = await response.text()
      const parsed = this.parseNewsReleases(html)
      console.log(`[IrsNewsHarvester] Parsed ${parsed.length} news release(s)`)

      for (const entry of parsed) {
        // Filter to items published since the cutoff date
        if (entry.date && entry.date < sinceDate) continue

        items.push({
          sourceUrl: entry.url,
          title: entry.title,
          rawContent: entry.description || entry.title,
          contentType: 'text/html',
          publicationDate: entry.date ?? undefined,
          authorityTier: 'B2',
          jurisdiction: 'federal',
          metadata: {
            irNumber: entry.irNumber,
            feedSource: 'irs_newsroom_scrape',
          },
        })
      }

      console.log(`[IrsNewsHarvester] ${items.length} items after date filtering`)
    } catch (e) {
      console.error(
        `[IrsNewsHarvester] Fetch failed:`,
        e instanceof Error ? e.message : e
      )
    }

    return items
  }

  /**
   * Parse news releases from the IRS monthly news page.
   * The page lists releases as links with IR numbers and dates.
   */
  private parseNewsReleases(
    html: string
  ): Array<{ title: string; url: string; irNumber: string; description: string; date: Date | null }> {
    const results: Array<{
      title: string
      url: string
      irNumber: string
      description: string
      date: Date | null
    }> = []

    // Match links to individual news releases — pattern: /newsroom/ir-YYYY-NNN or /newsroom/some-slug
    const linkRe = /<a[^>]*href="(\/newsroom\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null

    while ((match = linkRe.exec(html)) !== null) {
      const href = match[1]
      const linkText = match[2].replace(/<[^>]+>/g, '').trim()

      // Skip navigation links, breadcrumbs, etc.
      if (!linkText || linkText.length < 10) continue
      if (href.includes('rss') || href.includes('subscribe') || href.includes('archive')) continue
      if (href === '/newsroom' || href.endsWith('/newsroom/')) continue

      // Extract IR number if present (e.g., "IR-2026-45")
      const irMatch = linkText.match(/IR-\d{4}-\d+/i) || href.match(/ir-(\d{4}-\d+)/i)
      const irNumber = irMatch ? irMatch[0].toUpperCase() : ''

      // Try to extract date from surrounding text
      let date: Date | null = null
      const dateMatch = linkText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i)
      if (dateMatch) {
        const parsed = new Date(dateMatch[0])
        if (!isNaN(parsed.getTime())) date = parsed
      }

      // Clean up the title
      const title = linkText
        .replace(/IR-\d{4}-\d+\s*[-—]\s*/i, '')  // Remove IR number prefix
        .replace(/\s+/g, ' ')
        .trim()

      if (title.length < 5) continue

      results.push({
        title,
        url: `https://www.irs.gov${href}`,
        irNumber,
        description: title,
        date,
      })
    }

    // Deduplicate by URL
    const seen = new Set<string>()
    return results.filter(r => {
      if (seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })
  }
}
