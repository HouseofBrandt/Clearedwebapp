import { prisma } from '@/lib/db'

/**
 * Promote an authority from one layer to the next.
 * RAW -> CURATED: requires human review approval
 * CURATED -> DISTILLED: requires AI summary generation + human approval
 *
 * This function updates the authority's promotionLayer and all its chunks.
 * The caller is responsible for ensuring the prerequisite review/approval
 * steps have been completed before calling this function.
 */
export async function promoteAuthority(
  authorityId: string,
  targetLayer: 'CURATED' | 'DISTILLED'
): Promise<void> {
  const authority = await prisma.canonicalAuthority.findUniqueOrThrow({
    where: { id: authorityId },
  })

  // Validate promotion path
  validatePromotion(authority.promotionLayer, targetLayer)

  // Update the authority's promotion layer
  await prisma.canonicalAuthority.update({
    where: { id: authorityId },
    data: { promotionLayer: targetLayer },
  })

  // Promote all chunks to the same layer
  await prisma.authorityChunk.updateMany({
    where: { authorityId },
    data: { promotionLayer: targetLayer },
  })
}

/**
 * Promote all chunks of an authority to the target layer.
 * Returns the number of chunks promoted.
 *
 * Unlike promoteAuthority, this only promotes the chunks
 * without changing the authority's own promotionLayer.
 * Useful for incremental promotion of individual chunks.
 */
export async function promoteChunks(
  authorityId: string,
  targetLayer: 'CURATED' | 'DISTILLED'
): Promise<number> {
  // Determine the source layer based on target
  const sourceLayer = targetLayer === 'CURATED' ? 'RAW' : 'CURATED'

  const result = await prisma.authorityChunk.updateMany({
    where: {
      authorityId,
      promotionLayer: sourceLayer,
    },
    data: { promotionLayer: targetLayer },
  })

  return result.count
}

/**
 * Get promotion statistics across all authorities.
 */
export async function getPromotionStats(): Promise<{
  raw: number
  curated: number
  distilled: number
}> {
  const [raw, curated, distilled] = await Promise.all([
    prisma.canonicalAuthority.count({
      where: { promotionLayer: 'RAW' },
    }),
    prisma.canonicalAuthority.count({
      where: { promotionLayer: 'CURATED' },
    }),
    prisma.canonicalAuthority.count({
      where: { promotionLayer: 'DISTILLED' },
    }),
  ])

  return { raw, curated, distilled }
}

/**
 * Validate that the promotion path is valid.
 * RAW -> CURATED and CURATED -> DISTILLED are the only valid transitions.
 */
function validatePromotion(
  currentLayer: string,
  targetLayer: 'CURATED' | 'DISTILLED'
): void {
  if (targetLayer === 'CURATED' && currentLayer !== 'RAW') {
    throw new Error(
      `Cannot promote to CURATED: authority is currently ${currentLayer}, expected RAW`
    )
  }

  if (targetLayer === 'DISTILLED' && currentLayer !== 'CURATED') {
    throw new Error(
      `Cannot promote to DISTILLED: authority is currently ${currentLayer}, expected CURATED`
    )
  }
}
