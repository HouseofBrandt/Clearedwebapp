import { prisma } from '@/lib/db'
import { createHash } from 'crypto'
import type { ChangeSeverity } from '../types'

/**
 * Create a new version of an authority if content has changed.
 * Returns the version number created, or null if no change.
 */
export async function createVersion(
  authorityId: string,
  content: string,
  options?: {
    effectiveDate?: Date
    publicationDate?: Date
    changeSummary?: string
  }
): Promise<number | null> {
  const contentHash = hashContent(content)

  // Find the latest existing version for this authority
  const latestVersion = await prisma.authorityVersion.findFirst({
    where: { authorityId },
    orderBy: { versionNumber: 'desc' },
  })

  // If content hash matches the latest version, no change occurred
  if (latestVersion && latestVersion.contentHash === contentHash) {
    // Update lastVerifiedAt since we confirmed content is unchanged
    await prisma.canonicalAuthority.update({
      where: { id: authorityId },
      data: { lastVerifiedAt: new Date() },
    })
    return null
  }

  const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1

  // Determine change severity
  const authority = await prisma.canonicalAuthority.findUniqueOrThrow({
    where: { id: authorityId },
  })

  const changeSeverity = latestVersion
    ? assessChangeSeverity(latestVersion.content, content, authority.authorityTier)
    : 'INFORMATIONAL_CHANGE' as ChangeSeverity

  // Create the new version
  await prisma.authorityVersion.create({
    data: {
      authorityId,
      versionNumber: newVersionNumber,
      contentHash,
      content,
      effectiveDate: options?.effectiveDate ?? null,
      publicationDate: options?.publicationDate ?? null,
      changeSeverity,
      changeSummary: options?.changeSummary ?? null,
    },
  })

  // Update the authority's lastVerifiedAt and dates if provided
  await prisma.canonicalAuthority.update({
    where: { id: authorityId },
    data: {
      lastVerifiedAt: new Date(),
      ...(options?.effectiveDate && { effectiveDate: options.effectiveDate }),
      ...(options?.publicationDate && { publicationDate: options.publicationDate }),
    },
  })

  return newVersionNumber
}

/**
 * Determine the severity of a change between two content versions.
 *
 * Rules:
 * - Tier A1/A2 and >20% changed -> CRITICAL
 * - Tier A1/A2 and 5-20% changed -> HIGH
 * - Tier B1/B2 and >20% changed -> HIGH
 * - <5% for any tier -> LOW
 * - Default -> MODERATE
 */
export function assessChangeSeverity(
  oldContent: string,
  newContent: string,
  authorityTier: string
): ChangeSeverity {
  const diffRatio = computeDiffRatio(oldContent, newContent)

  const isHighTier = authorityTier === 'A1' || authorityTier === 'A2'
  const isMidTier = authorityTier === 'B1' || authorityTier === 'B2'

  if (diffRatio < 0.05) {
    return 'LOW'
  }

  if (isHighTier) {
    return diffRatio > 0.20 ? 'CRITICAL' : 'HIGH'
  }

  if (isMidTier && diffRatio > 0.20) {
    return 'HIGH'
  }

  return 'MODERATE'
}

/**
 * Compute the ratio of changed content between two strings.
 *
 * Uses a simple line-based diff approach: splits both texts into lines,
 * counts how many lines differ, and returns the ratio of changed lines
 * to total lines.
 */
function computeDiffRatio(oldContent: string, newContent: string): number {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  const maxLines = Math.max(oldLines.length, newLines.length)
  if (maxLines === 0) return 0

  // Build a set of old lines for quick lookup
  const oldLineSet = new Set(oldLines)
  const newLineSet = new Set(newLines)

  // Count lines that appear in one version but not the other
  let changedCount = 0
  for (const line of newLines) {
    if (!oldLineSet.has(line)) {
      changedCount++
    }
  }
  for (const line of oldLines) {
    if (!newLineSet.has(line)) {
      changedCount++
    }
  }

  // Divide by total unique lines across both versions to get the diff ratio
  const totalLines = oldLines.length + newLines.length
  if (totalLines === 0) return 0

  return changedCount / totalLines
}

/**
 * Compute a SHA-256 hash of the content for deduplication.
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
