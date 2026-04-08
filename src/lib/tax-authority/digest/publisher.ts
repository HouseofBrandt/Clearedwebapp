/**
 * Daily Digest Publisher — builds and stores a DailyDigest record.
 */

import { prisma } from '@/lib/db'
import { buildDailyDigest } from './builder'

/**
 * Build the daily digest and persist it as a DailyDigest record.
 *
 * @returns the ID of the created DailyDigest record
 */
export async function publishDailyDigest(): Promise<string> {
  const digest = await buildDailyDigest()

  const detailsJson = JSON.parse(JSON.stringify(digest.details))

  // Normalize digestDate to start-of-day UTC so the upsert unique key
  // matches consistently regardless of when during the day this runs
  const normalizedDate = new Date(digest.digestDate)
  normalizedDate.setUTCHours(0, 0, 0, 0)

  const record = await prisma.dailyDigest.upsert({
    where: { digestDate: normalizedDate },
    update: {
      newAuthorities: digest.newAuthorities,
      changedAuthorities: digest.changedAuthorities,
      supersededItems: digest.supersededItems,
      benchmarkDrifts: digest.benchmarkDrifts,
      knowledgeGaps: digest.knowledgeGaps,
      summary: digest.summary,
      details: detailsJson,
      publishedAt: new Date(),
    },
    create: {
      digestDate: normalizedDate,
      newAuthorities: digest.newAuthorities,
      changedAuthorities: digest.changedAuthorities,
      supersededItems: digest.supersededItems,
      benchmarkDrifts: digest.benchmarkDrifts,
      knowledgeGaps: digest.knowledgeGaps,
      summary: digest.summary,
      details: detailsJson,
      publishedAt: new Date(),
    },
  })

  return record.id
}
