import { prisma } from "@/lib/db"

/**
 * Policy Gate — SOC 2 CC1.1, CC2.2, CC5.3
 *
 * Checks whether a user has acknowledged all active compliance policies
 * at their current version. Used to block the UI until all policies
 * are acknowledged.
 */

export interface UnacknowledgedPolicy {
  id: string
  slug: string
  title: string
  content: string
  version: number
  effectiveDate: Date
}

/**
 * Get all active compliance policies that the given user has NOT
 * acknowledged at the current version.
 */
export async function getUnacknowledgedPolicies(
  userId: string
): Promise<UnacknowledgedPolicy[]> {
  // Get all active policies
  const activePolicies = await prisma.compliancePolicy.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  })

  if (activePolicies.length === 0) {
    return []
  }

  // Get all acknowledgments for this user
  const acknowledgments = await prisma.policyAcknowledgment.findMany({
    where: { userId },
  })

  // Build a set of "policyId:version" that the user has acknowledged
  const ackSet = new Set(
    acknowledgments.map((a) => `${a.policyId}:${a.version}`)
  )

  // Return policies the user hasn't acknowledged at the current version
  return activePolicies
    .filter((p) => !ackSet.has(`${p.id}:${p.version}`))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      content: p.content,
      version: p.version,
      effectiveDate: p.effectiveDate,
    }))
}

/**
 * Check if a user has acknowledged all active policies.
 * Returns true if there are no unacknowledged policies.
 */
export async function hasAcknowledgedAllPolicies(
  userId: string
): Promise<boolean> {
  const unacknowledged = await getUnacknowledgedPolicies(userId)
  return unacknowledged.length === 0
}
