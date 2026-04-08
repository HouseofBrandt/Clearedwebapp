/**
 * IRB Harvester — scrapes the IRS Internal Revenue Bulletin index page
 * for weekly bulletin listings and fetches individual bulletin pages.
 *
 * Each IRB contains multiple items (Treasury Decisions, Revenue Rulings,
 * Revenue Procedures, Notices, Announcements). The authority tier is
 * assigned based on item type:
 *   - Treasury Decisions → A3
 *   - Revenue Rulings / Revenue Procedures → A4
 *   - Notices / Announcements → A4
 */

import { BaseHarvester, type FetchedItem, type HarvesterConfig } from './base-harvester'
import type { AuthorityTier } from '../types'

const IRB_INDEX_URL = 'https://www.irs.gov/irb'
const IRB_BULLETIN_BASE = 'https://www.irs.gov/irb'

/** Regex to match bulletin links like "2025-01_IRB" or "2024-52_IRB" */
const BULLETIN_LINK_RE = /href="[^"]*\/irb\/(\d{4}-\d{1,2})_IRB"/gi

/** Regex to identify IRB item types from headings/content */
const IRB_ITEM_TYPE_RE =
  /(?:Treasury\s+Decision|T\.D\.)\s+(\d+)|(?:Rev(?:enue)?\.?\s*Rul(?:ing)?\.?\s*)(\d{4}-\d+)|(?:Rev(?:enue)?\.?\s*Proc(?:edure)?\.?\s*)(\d{4}-\d+)|(?:Notice\s+)(\d{4}-\d+)|(?:Announcement\s+)(\d{4}-\d+)/gi

export class IrbHarvester extends BaseHarvester {
  constructor(config?: Partial<HarvesterConfig>) {
    super({
      sourceId: 'irs_irb',
      name: 'Internal Revenue Bulletin',
      endpoint: IRB_INDEX_URL,
      rightsProfile: 'PUBLIC_INGEST_OK',
      defaultTier: 'A4',
      rateLimitMs: 1000,
      maxRetries: 3,
      ...config,
    })
  }

  protected async fetchItems(since: Date | null): Promise<FetchedItem[]> {
    const items: FetchedItem[] = []

    // Fetch the IRB index page to discover bulletin numbers
    const bulletinNumbers = await this.fetchBulletinNumbers()

    // Filter to only new bulletins we haven't ingested yet
    const newBulletins = await this.filterNewBulletins(bulletinNumbers)

    for (const bulletinNumber of newBulletins) {
      try {
        const bulletinItems = await this.fetchBulletin(bulletinNumber)
        items.push(...bulletinItems)
      } catch (e) {
        console.error(`[IrbHarvester] Failed to fetch IRB ${bulletinNumber}:`, e)
      }
    }

    return items
  }

  /**
   * Fetch the IRB index page and extract all bulletin numbers.
   * Returns bulletin numbers like ["2025-01", "2025-02", ...].
   */
  private async fetchBulletinNumbers(): Promise<string[]> {
    const response = await this.rateLimitedFetch(IRB_INDEX_URL, {
      headers: { Accept: 'text/html' },
    })
    const html = await response.text()

    const bulletins: string[] = []
    const seen = new Set<string>()
    let match: RegExpExecArray | null
    const re = new RegExp(BULLETIN_LINK_RE.source, BULLETIN_LINK_RE.flags)

    while ((match = re.exec(html)) !== null) {
      const num = match[1]
      if (!seen.has(num)) {
        seen.add(num)
        bulletins.push(num)
      }
    }

    return bulletins
  }

  /**
   * Filter bulletin numbers to only those not already ingested.
   * Uses the sourceHash mechanism — checks if an artifact with that
   * bulletin number already exists.
   */
  private async filterNewBulletins(bulletinNumbers: string[]): Promise<string[]> {
    const newBulletins: string[] = []

    for (const num of bulletinNumbers) {
      const title = `IRB ${num}`
      const hash = this.computeHash(title)

      // We use a lightweight check: if we already have an artifact with this
      // normalized title, skip it. The base class storeArtifact also deduplicates
      // by content hash, but this avoids unnecessary HTTP requests.
      try {
        const { prisma } = await import('@/lib/db')
        const existing = await prisma.sourceArtifact.findFirst({
          where: {
            sourceId: this.config.sourceId,
            normalizedTitle: title,
          },
        })
        if (!existing) {
          newBulletins.push(num)
        }
      } catch {
        // If DB is unavailable, fetch all and let storeArtifact deduplicate
        newBulletins.push(num)
      }
    }

    return newBulletins
  }

  /**
   * Fetch a single bulletin page and extract items from it.
   */
  private async fetchBulletin(bulletinNumber: string): Promise<FetchedItem[]> {
    const url = `${IRB_BULLETIN_BASE}/${bulletinNumber}_IRB`
    const response = await this.rateLimitedFetch(url, {
      headers: { Accept: 'text/html' },
    })
    const html = await response.text()

    // Parse publication date from the bulletin number (YYYY-WW format)
    const [yearStr] = bulletinNumber.split('-')
    const publicationDate = this.estimateBulletinDate(bulletinNumber)

    // Extract individual items from the bulletin
    const bulletinItems = this.extractBulletinItems(html, bulletinNumber)

    if (bulletinItems.length === 0) {
      // If we can't parse individual items, store the whole bulletin
      return [
        {
          sourceUrl: url,
          title: `IRB ${bulletinNumber}`,
          rawContent: html,
          contentType: 'text/html',
          publicationDate,
          authorityTier: this.config.defaultTier,
          jurisdiction: 'federal',
          metadata: {
            bulletinNumber,
            year: parseInt(yearStr, 10),
          },
        },
      ]
    }

    return bulletinItems
  }

  /**
   * Extract individual items (TD, Rev. Rul., Rev. Proc., Notice, Announcement)
   * from the bulletin HTML.
   */
  private extractBulletinItems(html: string, bulletinNumber: string): FetchedItem[] {
    const items: FetchedItem[] = []
    const publicationDate = this.estimateBulletinDate(bulletinNumber)
    const [yearStr] = bulletinNumber.split('-')
    const year = parseInt(yearStr, 10)

    const re = new RegExp(IRB_ITEM_TYPE_RE.source, IRB_ITEM_TYPE_RE.flags)
    let match: RegExpExecArray | null

    while ((match = re.exec(html)) !== null) {
      const tdNumber = match[1]
      const revRulNumber = match[2]
      const revProcNumber = match[3]
      const noticeNumber = match[4]
      const announcementNumber = match[5]

      let title: string
      let tier: AuthorityTier
      let itemType: string

      if (tdNumber) {
        title = `T.D. ${tdNumber}`
        tier = 'A3'
        itemType = 'treasury_decision'
      } else if (revRulNumber) {
        title = `Rev. Rul. ${revRulNumber}`
        tier = 'A4'
        itemType = 'revenue_ruling'
      } else if (revProcNumber) {
        title = `Rev. Proc. ${revProcNumber}`
        tier = 'A4'
        itemType = 'revenue_procedure'
      } else if (noticeNumber) {
        title = `Notice ${noticeNumber}`
        tier = 'A4'
        itemType = 'notice'
      } else if (announcementNumber) {
        title = `Announcement ${announcementNumber}`
        tier = 'A4'
        itemType = 'announcement'
      } else {
        continue
      }

      // Avoid duplicate items within the same bulletin
      if (items.some((i) => i.title === title)) continue

      items.push({
        sourceUrl: `${IRB_BULLETIN_BASE}/${bulletinNumber}_IRB`,
        title,
        rawContent: html,
        contentType: 'text/html',
        publicationDate,
        authorityTier: tier,
        jurisdiction: 'federal',
        metadata: {
          bulletinNumber,
          itemType,
          year,
        },
      })
    }

    return items
  }

  /**
   * Estimate the publication date from a bulletin number (YYYY-WW).
   * Week 1 starts the first Monday of the year.
   */
  private estimateBulletinDate(bulletinNumber: string): Date {
    const [yearStr, weekStr] = bulletinNumber.split('-')
    const year = parseInt(yearStr, 10)
    const week = parseInt(weekStr, 10)

    // Approximate: first day of the year + (week - 1) * 7 days
    const jan1 = new Date(year, 0, 1)
    const dayOffset = (week - 1) * 7
    return new Date(jan1.getTime() + dayOffset * 86400000)
  }
}
