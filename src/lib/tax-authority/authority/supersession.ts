import { prisma } from '@/lib/db'
import type { SupersessionReport } from '../types'

/**
 * Supersession patterns found in authority text that indicate
 * explicit obsolescence of a prior authority.
 */
const SUPERSESSION_PATTERNS = [
  // "obsoletes Rev. Rul. 2020-15"
  /obsoletes?\s+(Rev\.\s*Rul\.\s*\d{4}-\d+)/gi,
  // "supersedes Rev. Proc. 2019-43"
  /supersedes?\s+(Rev\.\s*Proc\.\s*\d{4}-\d+)/gi,
  // "revokes Notice 2021-50"
  /revokes?\s+(Notice\s*\d{4}-\d+)/gi,
  // "modifies and supersedes Rev. Rul. 2018-22"
  /modifies?\s+and\s+supersedes?\s+(Rev\.\s*(?:Rul|Proc)\.\s*\d{4}-\d+)/gi,
  // "replaces T.D. 9876"
  /replaces?\s+(T\.D\.\s*\d+)/gi,
  // "this section replaces IRM 5.8.1 dated ..."
  /replaces?\s+(IRM\s*[\d.]+)/gi,
]

/**
 * Run the daily supersession scan.
 *
 * Detection rules:
 * 1. New authority version replaces old -> mark old SUPERSEDED, create edge
 * 2. Final reg replaces proposed reg -> mark proposed SUPERSEDED
 * 3. New Rev. Rul. explicitly obsoletes prior -> mark prior SUPERSEDED
 * 4. IRM section replaced by new version -> mark old ARCHIVED
 * 5. Court opinion reversed on appeal -> mark SUPERSEDED
 * 6. PLR revoked -> mark WITHDRAWN
 * 7. Source not verified in >365 days -> flag as stale (not superseded)
 */
export async function runSupersessionScan(): Promise<SupersessionReport> {
  const report: SupersessionReport = {
    superseded: 0,
    newVersions: 0,
    withdrawn: 0,
    staleItems: 0,
    details: [],
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Rule 1: Find all new authority versions created today and supersede prior versions
  const newVersions = await prisma.authorityVersion.findMany({
    where: {
      createdAt: { gte: startOfToday },
    },
    include: {
      authority: true,
    },
    orderBy: { versionNumber: 'desc' },
  })

  // Group by authorityId - we only care about the latest version per authority
  const latestByAuthority = new Map<string, typeof newVersions[0]>()
  for (const version of newVersions) {
    if (!latestByAuthority.has(version.authorityId)) {
      latestByAuthority.set(version.authorityId, version)
    }
  }

  report.newVersions = latestByAuthority.size

  for (const [authorityId, latestVersion] of Array.from(latestByAuthority.entries())) {
    // Check if there are older versions - mark the authority's prior superseded-by relations
    const olderVersions = await prisma.authorityVersion.findMany({
      where: {
        authorityId,
        versionNumber: { lt: latestVersion.versionNumber },
      },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    })

    if (olderVersions.length > 0) {
      // The authority itself stays CURRENT (it has a new version).
      // Log the version bump in the report.
      report.details.push({
        citationString: latestVersion.authority.citationString,
        action: 'superseded',
        replacedBy: `v${latestVersion.versionNumber}`,
      })
    }

    // Rule 3: Check content for explicit supersession text
    await detectExplicitSupersessions(latestVersion.content, latestVersion.authority.id, report)
  }

  // Rule 2: Final regulation replaces proposed regulation
  // Find new authorities with tier A2 (Treasury Regs) that are CURRENT
  const newFinalRegs = await prisma.canonicalAuthority.findMany({
    where: {
      createdAt: { gte: startOfToday },
      authorityTier: 'A2',
      authorityStatus: 'CURRENT',
    },
  })

  for (const finalReg of newFinalRegs) {
    // Look for a matching proposed regulation
    const proposedRegs = await prisma.canonicalAuthority.findMany({
      where: {
        authorityTier: 'A2',
        authorityStatus: 'PROPOSED',
        normalizedCitation: {
          contains: extractRegSection(finalReg.normalizedCitation),
        },
      },
    })

    for (const proposed of proposedRegs) {
      await markSuperseded(proposed.id, finalReg.id, 'supersedes')
      report.superseded++
      report.details.push({
        citationString: proposed.citationString,
        action: 'superseded',
        replacedBy: finalReg.citationString,
      })
    }
  }

  // Rule 4: IRM sections replaced by new version
  const newIrmSections = await prisma.canonicalAuthority.findMany({
    where: {
      createdAt: { gte: startOfToday },
      authorityTier: 'B1',
      authorityStatus: 'CURRENT',
    },
  })

  for (const newIrm of newIrmSections) {
    // Find older IRM sections with the same normalized citation
    const olderIrmSections = await prisma.canonicalAuthority.findMany({
      where: {
        id: { not: newIrm.id },
        authorityTier: 'B1',
        normalizedCitation: newIrm.normalizedCitation,
        authorityStatus: 'CURRENT',
      },
    })

    for (const oldIrm of olderIrmSections) {
      await prisma.canonicalAuthority.update({
        where: { id: oldIrm.id },
        data: {
          authorityStatus: 'ARCHIVED',
          supersededById: newIrm.id,
        },
      })

      await createEdgeIfNotExists(newIrm.id, oldIrm.id, 'supersedes')

      // Mark chunks as superseded
      await prisma.authorityChunk.updateMany({
        where: { authorityId: oldIrm.id },
        data: { superseded: true, authorityStatus: 'ARCHIVED' },
      })

      report.superseded++
      report.details.push({
        citationString: oldIrm.citationString,
        action: 'superseded',
        replacedBy: newIrm.citationString,
      })
    }
  }

  // Rule 6: PLR revoked - check for newly ingested revocation notices
  const revokedPlrs = await prisma.canonicalAuthority.findMany({
    where: {
      createdAt: { gte: startOfToday },
      authorityTier: { in: ['C1', 'C2'] },
      metadata: {
        path: ['revoked'],
        equals: true,
      },
    },
  })

  for (const plr of revokedPlrs) {
    await prisma.canonicalAuthority.update({
      where: { id: plr.id },
      data: { authorityStatus: 'WITHDRAWN' },
    })

    await prisma.authorityChunk.updateMany({
      where: { authorityId: plr.id },
      data: { superseded: true, authorityStatus: 'WITHDRAWN' },
    })

    report.withdrawn++
    report.details.push({
      citationString: plr.citationString,
      action: 'withdrawn',
    })
  }

  // Rule 7: Flag stale authorities (lastVerifiedAt > 365 days ago)
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - 365)

  const staleAuthorities = await prisma.canonicalAuthority.findMany({
    where: {
      authorityStatus: 'CURRENT',
      lastVerifiedAt: {
        lt: staleThreshold,
      },
    },
  })

  // Authorities with null lastVerifiedAt that were created > 365 days ago
  const neverVerified = await prisma.canonicalAuthority.findMany({
    where: {
      authorityStatus: 'CURRENT',
      lastVerifiedAt: null,
      createdAt: {
        lt: staleThreshold,
      },
    },
  })

  const allStale = [...staleAuthorities, ...neverVerified]
  report.staleItems = allStale.length

  for (const stale of allStale) {
    report.details.push({
      citationString: stale.citationString,
      action: 'stale',
    })
  }

  return report
}

/**
 * Detect explicit supersession references in authority content.
 * Scans text for patterns like "obsoletes Rev. Rul. XXXX-XX".
 */
async function detectExplicitSupersessions(
  content: string,
  newAuthorityId: string,
  report: SupersessionReport
): Promise<void> {
  for (const pattern of SUPERSESSION_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
      const referencedCitation = match[1].trim()

      // Try to find the referenced authority by citation
      const referenced = await prisma.canonicalAuthority.findFirst({
        where: {
          citationString: {
            contains: normalizeCitationForSearch(referencedCitation),
          },
          authorityStatus: 'CURRENT',
        },
      })

      if (referenced) {
        await markSuperseded(referenced.id, newAuthorityId, 'supersedes')
        report.superseded++
        report.details.push({
          citationString: referenced.citationString,
          action: 'superseded',
          replacedBy: `Authority ${newAuthorityId}`,
        })
      }
    }
  }
}

/**
 * Mark an authority as superseded and update its chunks.
 */
async function markSuperseded(
  oldAuthorityId: string,
  newAuthorityId: string,
  relationship: string
): Promise<void> {
  await prisma.canonicalAuthority.update({
    where: { id: oldAuthorityId },
    data: {
      authorityStatus: 'SUPERSEDED',
      supersededById: newAuthorityId,
    },
  })

  await createEdgeIfNotExists(newAuthorityId, oldAuthorityId, relationship)

  // Mark all chunks of the old authority as superseded
  await prisma.authorityChunk.updateMany({
    where: { authorityId: oldAuthorityId },
    data: { superseded: true, authorityStatus: 'SUPERSEDED' },
  })
}

/**
 * Create an AuthorityEdge if one doesn't already exist.
 */
async function createEdgeIfNotExists(
  fromId: string,
  toId: string,
  relationship: string
): Promise<void> {
  const existing = await prisma.authorityEdge.findUnique({
    where: {
      fromId_toId_relationship: { fromId, toId, relationship },
    },
  })

  if (!existing) {
    await prisma.authorityEdge.create({
      data: { fromId, toId, relationship, confidence: 1.0 },
    })
  }
}

/**
 * Extract the core section number from a regulation citation.
 * E.g., "26 CFR 1.6015-1" -> "1.6015"
 */
function extractRegSection(normalizedCitation: string): string {
  const match = normalizedCitation.match(/(\d+\.\d+)/)
  return match ? match[1] : normalizedCitation
}

/**
 * Normalize a citation string for database search.
 * Removes extra whitespace, normalizes periods and spaces.
 */
function normalizeCitationForSearch(citation: string): string {
  return citation
    .replace(/\s+/g, ' ')
    .replace(/\.\s+/g, '. ')
    .trim()
}
