import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import type { HarvestResult, SourceRightsProfile, AuthorityTier } from '../types'
import { checkLicense } from './license-guard'

export interface HarvesterConfig {
  sourceId: string
  name: string
  endpoint: string
  altEndpoint?: string
  rightsProfile: SourceRightsProfile
  defaultTier: AuthorityTier
  rateLimitMs: number
  maxRetries: number
}

export interface FetchedItem {
  sourceUrl: string
  title: string
  rawContent: string
  contentType: string
  publicationDate?: Date
  effectiveDate?: Date
  authorityTier?: AuthorityTier
  jurisdiction?: string
  metadata?: Record<string, unknown>
}

export abstract class BaseHarvester {
  protected config: HarvesterConfig
  private lastRequestTime = 0

  constructor(config: HarvesterConfig) {
    this.config = { ...config, maxRetries: config.maxRetries ?? 3 }
  }

  protected abstract fetchItems(since: Date | null): Promise<FetchedItem[]>

  async harvest(): Promise<HarvestResult> {
    const startTime = Date.now()
    const result: HarvestResult = {
      sourceId: this.config.sourceId,
      itemsFetched: 0,
      itemsNew: 0,
      itemsChanged: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      errors: [],
      durationMs: 0,
    }

    const run = await prisma.ingestionRun.create({
      data: { sourceId: this.config.sourceId, status: 'FETCHING' },
    })

    try {
      await checkLicense(this.config.endpoint, this.config.rightsProfile)

      const source = await prisma.sourceRegistry.findUnique({
        where: { sourceId: this.config.sourceId },
      })
      const since = source?.lastSuccessAt ?? null

      const items = await this.fetchItems(since)
      result.itemsFetched = items.length

      for (const item of items) {
        try {
          const stored = await this.storeArtifact(item, run.id)
          if (stored === 'new') result.itemsNew++
          else if (stored === 'changed') result.itemsChanged++
          else result.itemsSkipped++
        } catch (e) {
          result.itemsFailed++
          result.errors.push(
            `Failed to store ${item.title}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      await prisma.sourceRegistry.update({
        where: { sourceId: this.config.sourceId },
        data: {
          lastFetchedAt: new Date(),
          lastSuccessAt: new Date(),
          fetchCount: { increment: 1 },
        },
      })

      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETE',
          completedAt: new Date(),
          itemsFetched: result.itemsFetched,
          itemsNew: result.itemsNew,
          itemsChanged: result.itemsChanged,
          itemsSkipped: result.itemsSkipped,
          itemsFailed: result.itemsFailed,
        },
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      result.errors.push(errorMessage)

      await prisma.sourceRegistry
        .update({
          where: { sourceId: this.config.sourceId },
          data: {
            lastFetchedAt: new Date(),
            lastErrorAt: new Date(),
            lastError: errorMessage,
            errorCount: { increment: 1 },
          },
        })
        .catch(() => {})

      await prisma.ingestionRun
        .update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorLog: errorMessage,
            itemsFetched: result.itemsFetched,
            itemsNew: result.itemsNew,
            itemsChanged: result.itemsChanged,
            itemsSkipped: result.itemsSkipped,
            itemsFailed: result.itemsFailed,
          },
        })
        .catch(() => {})
    }

    result.durationMs = Date.now() - startTime
    return result
  }

  protected async rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.config.rateLimitMs) {
      await new Promise((r) => setTimeout(r, this.config.rateLimitMs - elapsed))
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        this.lastRequestTime = Date.now()
        const response = await fetch(url, {
          ...init,
          headers: {
            'User-Agent': 'ClearedTaxResolution/1.0 (tax-authority-research)',
            ...init?.headers,
          },
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return response
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt < this.config.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        }
      }
    }
    throw lastError!
  }

  protected computeHash(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  private async storeArtifact(
    item: FetchedItem,
    ingestionRunId: string
  ): Promise<'new' | 'changed' | 'skipped'> {
    const sourceHash = this.computeHash(item.rawContent)

    const existing = await prisma.sourceArtifact.findFirst({
      where: { sourceId: this.config.sourceId, sourceHash },
    })
    if (existing) return 'skipped'

    const previous = await prisma.sourceArtifact.findFirst({
      where: { sourceId: this.config.sourceId, normalizedTitle: item.title },
      orderBy: { fetchedAt: 'desc' },
    })

    await prisma.sourceArtifact.create({
      data: {
        sourceId: this.config.sourceId,
        sourceUrl: item.sourceUrl,
        normalizedTitle: item.title,
        publicationDate: item.publicationDate,
        effectiveDate: item.effectiveDate,
        sourceHash,
        rawContent: Buffer.from(item.rawContent),
        contentType: item.contentType,
        rightsProfile: this.config.rightsProfile,
        authorityTier: item.authorityTier ?? this.config.defaultTier,
        jurisdiction: item.jurisdiction,
        metadata: item.metadata ? (item.metadata as Record<string, string>) : undefined,
        ingestionRunId,
        parserStatus: 'PENDING',
      },
    })

    return previous ? 'changed' : 'new'
  }
}
