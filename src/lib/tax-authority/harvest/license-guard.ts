import { prisma } from '@/lib/db'
import type { SourceRightsProfile } from '../types'
import { PROHIBITED_DOMAINS } from '../constants'

export class LicenseGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LicenseGuardError'
  }
}

export async function checkLicense(url: string, rightsProfile: SourceRightsProfile): Promise<void> {
  // Check rights profile
  if (rightsProfile === 'LICENSE_REQUIRED' || rightsProfile === 'NO_AUTOMATION') {
    throw new LicenseGuardError(
      `Source rights profile "${rightsProfile}" prohibits automated ingestion: ${url}`
    )
  }

  // Check domain against prohibited list
  const domain = new URL(url).hostname.replace(/^www\./, '')
  if (PROHIBITED_DOMAINS.some(d => domain.endsWith(d))) {
    throw new LicenseGuardError(`Domain "${domain}" is in the prohibited sources list`)
  }

  // Check database license policies
  try {
    const policy = await prisma.licensePolicy.findFirst({
      where: {
        sourceDomain: domain,
        rightsProfile: { in: ['LICENSE_REQUIRED', 'NO_AUTOMATION'] },
      },
    })
    if (policy) {
      throw new LicenseGuardError(
        `Domain "${domain}" blocked by license policy: ${policy.displayName} (${policy.rightsProfile})`
      )
    }
  } catch (e) {
    if (e instanceof LicenseGuardError) throw e
    // DB not available — allow if static checks pass
  }
}
