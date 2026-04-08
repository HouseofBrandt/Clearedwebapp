/**
 * Source Policy — returns an ordered list of authority tiers to search
 * for a given set of issue categories.
 */

import type { IssueCategory, AuthorityTier } from '../types'
import { SOURCE_POLICY } from '../constants'

/**
 * Merge source policies for multiple issue categories.
 *
 * For each category, the SOURCE_POLICY constant defines an ordered list
 * of tiers from highest priority to lowest. When multiple categories are
 * involved, we merge their tier lists, deduplicate, and maintain priority
 * order based on earliest (lowest index) appearance across all policies.
 */
export function getSourcePolicy(issues: IssueCategory[]): AuthorityTier[] {
  if (issues.length === 0) {
    return SOURCE_POLICY.mixed
  }

  if (issues.length === 1) {
    return SOURCE_POLICY[issues[0]] ?? SOURCE_POLICY.mixed
  }

  // Merge: track the minimum index (highest priority) for each tier
  const tierPriority = new Map<AuthorityTier, number>()

  for (const issue of issues) {
    const tiers = SOURCE_POLICY[issue] ?? SOURCE_POLICY.mixed
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i]
      const existing = tierPriority.get(tier)
      if (existing === undefined || i < existing) {
        tierPriority.set(tier, i)
      }
    }
  }

  // Sort by priority (lowest index = highest priority), then by tier name
  const sorted = Array.from(tierPriority.entries())
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([tier]) => tier)

  return sorted
}
