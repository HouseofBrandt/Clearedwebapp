/**
 * Data Retention Policy Engine
 *
 * Implements automatic cleanup of sensitive data per configured retention periods.
 * Call via cron job: POST /api/cron/data-retention
 *
 * Default retention periods:
 * - detokenizedOutput: 90 days after last review action
 * - tokenMaps: 2 years after case closure
 * - auditLogs: 7 years (regulatory requirement)
 * - feedPosts (system events): 1 year
 */

import { prisma } from "@/lib/db"

export const RETENTION_PERIODS = {
  /** Detokenized AI output — contains raw PII, purge after review is complete */
  DETOKENIZED_OUTPUT_DAYS: 90,
  /** Token maps — needed for case reopening, retain per statute of limitations */
  TOKEN_MAP_YEARS: 2,
  /** Audit logs — regulatory minimum for tax professionals */
  AUDIT_LOG_YEARS: 7,
  /** System feed events — operational, not regulatory */
  SYSTEM_EVENT_DAYS: 365,
  /** Expired presigned URLs log entries */
  PRESIGNED_URL_LOG_DAYS: 30,
}

export async function enforceRetentionPolicies(): Promise<{
  detokenizedOutputsPurged: number
  expiredTokenMaps: number
  systemEventsPurged: number
}> {
  const now = new Date()

  // 1. Purge detokenized outputs older than 90 days (for approved/rejected tasks)
  const detokenizedCutoff = new Date(
    now.getTime() - RETENTION_PERIODS.DETOKENIZED_OUTPUT_DAYS * 24 * 60 * 60 * 1000
  )
  const detokenizedResult = await prisma.aITask.updateMany({
    where: {
      detokenizedOutput: { not: null },
      status: { in: ["APPROVED", "REJECTED"] },
      updatedAt: { lt: detokenizedCutoff },
    },
    data: {
      detokenizedOutput: null,
    },
  })

  // 2. Mark expired token maps
  const tokenMapCutoff = new Date(
    now.getTime() - RETENTION_PERIODS.TOKEN_MAP_YEARS * 365 * 24 * 60 * 60 * 1000
  )
  const tokenMapResult = await prisma.tokenMap
    .deleteMany({
      where: {
        expiresAt: { lt: now },
        createdAt: { lt: tokenMapCutoff },
      },
    })
    .catch(() => ({ count: 0 }))

  // 3. Purge old system events from feed
  const eventCutoff = new Date(
    now.getTime() - RETENTION_PERIODS.SYSTEM_EVENT_DAYS * 24 * 60 * 60 * 1000
  )
  const eventResult = await prisma.feedPost
    .deleteMany({
      where: {
        postType: "system_event",
        createdAt: { lt: eventCutoff },
      },
    })
    .catch(() => ({ count: 0 }))

  return {
    detokenizedOutputsPurged: detokenizedResult.count,
    expiredTokenMaps: tokenMapResult.count,
    systemEventsPurged: eventResult.count,
  }
}
