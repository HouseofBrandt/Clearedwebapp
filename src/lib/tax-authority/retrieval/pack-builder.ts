/**
 * Evidence Pack Builder — assembles ranked chunks into a structured
 * EvidencePack organized by authority category.
 *
 * Categories:
 *   - controllingAuthority: A1-A2 (IRC, Treasury Regs)
 *   - officialGuidance: A3-A4 (IRS guidance, IRB items)
 *   - relevantPrecedent: A5 (Tax Court opinions)
 *   - proceduralGuidance: B1-B2 (IRM, forms/publications)
 *   - reasoningSupport: C1 (PLRs, CCAs, TAMs)
 *   - internalExamples: C2 (internal firm knowledge)
 */

import type { RankedChunk, EvidencePack, IssueCategory, CautionFlag, AuthorityTier } from '../types'

// ─── Tier → category mapping ───────────────────────────────────────────────

const TIER_CATEGORY: Record<AuthorityTier, keyof Pick<
  EvidencePack,
  'controllingAuthority' | 'officialGuidance' | 'relevantPrecedent' |
  'proceduralGuidance' | 'reasoningSupport' | 'internalExamples'
>> = {
  A1: 'controllingAuthority',
  A2: 'controllingAuthority',
  A3: 'officialGuidance',
  A4: 'officialGuidance',
  A5: 'relevantPrecedent',
  B1: 'proceduralGuidance',
  B2: 'proceduralGuidance',
  C1: 'reasoningSupport',
  C2: 'internalExamples',
  D1: 'reasoningSupport',
  X: 'reasoningSupport',
}

/**
 * Build an EvidencePack from ranked chunks and issue classifications.
 *
 * Sorts chunks into categories based on their authority tier,
 * generates caution flags for superseded, nonprecedential, or
 * recently changed authorities.
 */
export function buildEvidencePack(
  chunks: RankedChunk[],
  issues: IssueCategory[]
): EvidencePack {
  const pack: EvidencePack = {
    issueClassification: issues,
    controllingAuthority: [],
    officialGuidance: [],
    relevantPrecedent: [],
    proceduralGuidance: [],
    reasoningSupport: [],
    internalExamples: [],
    cautionFlags: [],
    metadata: {
      totalChunks: chunks.length,
      topTier: chunks.length > 0 ? chunks[0].metadata.authorityTier : 'X',
      freshestSource: findFreshestDate(chunks),
      benchmarkConfidence: 0,
    },
  }

  // Sort chunks into categories
  for (const chunk of chunks) {
    const tier = chunk.metadata.authorityTier
    const category = TIER_CATEGORY[tier] ?? 'reasoningSupport'
    pack[category].push(chunk)
  }

  // Generate caution flags
  pack.cautionFlags = generateCautionFlags(chunks)

  return pack
}

/**
 * Find the most recent publication date among all chunks.
 */
function findFreshestDate(chunks: RankedChunk[]): Date {
  let freshest = new Date(0)

  for (const chunk of chunks) {
    const pubDate = chunk.metadata.publicationDate
    if (pubDate && pubDate > freshest) {
      freshest = pubDate
    }
    const effDate = chunk.metadata.effectiveDate
    if (effDate && effDate > freshest) {
      freshest = effDate
    }
  }

  return freshest.getTime() === 0 ? new Date() : freshest
}

/**
 * Generate caution flags based on chunk metadata.
 */
function generateCautionFlags(chunks: RankedChunk[]): CautionFlag[] {
  const flags: CautionFlag[] = []

  for (const chunk of chunks) {
    const { metadata } = chunk

    // Superseded warning
    if (metadata.superseded) {
      flags.push({
        type: 'superseded',
        message: `${metadata.citationString} has been superseded. Verify current authority.`,
        citationString: metadata.citationString,
        severity: 'warning',
      })
    }

    // Nonprecedential info
    if (metadata.precedentialStatus === 'NONPRECEDENTIAL') {
      flags.push({
        type: 'nonprecedential',
        message: `${metadata.citationString} is nonprecedential per IRC section 6110(k)(3). Cannot be cited as precedent.`,
        citationString: metadata.citationString,
        severity: 'info',
      })
    }

    // Recent change detection — if published within last 90 days
    if (metadata.publicationDate) {
      const daysSincePublished = (Date.now() - metadata.publicationDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSincePublished <= 90) {
        flags.push({
          type: 'recent_change',
          message: `${metadata.citationString} was recently published/updated. Review for applicability.`,
          citationString: metadata.citationString,
          severity: 'info',
        })
      }
    }
  }

  return flags
}
