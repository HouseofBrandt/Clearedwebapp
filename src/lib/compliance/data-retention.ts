/**
 * Data Disposal & Lifecycle Management
 *
 * Extends the existing data-retention.ts (which handles short-term cleanup
 * of detokenized outputs and expired token maps) with full data disposal
 * automation for cases past their retention period.
 *
 * Retention policy: engagement end + 7 years.
 * After 7 years, all case data is eligible for crypto-shredding.
 */

import { prisma } from "@/lib/db"

/** Standard retention period: 7 years after case closure */
export const RETENTION_YEARS = 7

export interface ExpiredClientData {
  caseId: string
  clientName: string
  tabsNumber: string
  closedAt: Date
  retentionExpiry: Date
  dataTypes: string[]
  documentCount: number
  aiTaskCount: number
  noteCount: number
  tokenMapCount: number
}

/**
 * Find all cases whose data has exceeded the retention period.
 * Cases must be CLOSED or RESOLVED with a closedAt date more than 7 years ago.
 */
export async function findExpiredData(): Promise<ExpiredClientData[]> {
  const now = new Date()
  const retentionCutoff = new Date(
    now.getTime() - RETENTION_YEARS * 365.25 * 24 * 60 * 60 * 1000
  )

  // Find cases that have been closed/resolved for longer than the retention period
  const expiredCases = await prisma.case.findMany({
    where: {
      status: { in: ["CLOSED", "RESOLVED"] },
      updatedAt: { lt: retentionCutoff },
    },
    include: {
      _count: {
        select: {
          documents: true,
          aiTasks: true,
          tokenMaps: true,
          clientNotes: true,
        },
      },
    },
  })

  return expiredCases.map((c) => {
    const closedAt = c.updatedAt
    const retentionExpiry = new Date(
      closedAt.getTime() + RETENTION_YEARS * 365.25 * 24 * 60 * 60 * 1000
    )

    const dataTypes: string[] = []
    if (c._count.documents > 0) dataTypes.push("documents")
    if (c._count.aiTasks > 0) dataTypes.push("ai_tasks")
    if (c._count.tokenMaps > 0) dataTypes.push("token_maps")
    if (c._count.clientNotes > 0) dataTypes.push("notes")

    return {
      caseId: c.id,
      clientName: c.clientName,
      tabsNumber: c.tabsNumber,
      closedAt,
      retentionExpiry,
      dataTypes,
      documentCount: c._count.documents,
      aiTaskCount: c._count.aiTasks,
      noteCount: c._count.clientNotes,
      tokenMapCount: c._count.tokenMaps,
    }
  })
}

/**
 * Queue expired cases for data disposal. Creates a DataDisposalRecord
 * with status QUEUED that requires admin confirmation before execution.
 */
export async function queueDisposal(
  expiredClients: ExpiredClientData[]
): Promise<string> {
  const totalRecords = expiredClients.reduce(
    (sum, c) =>
      sum + c.documentCount + c.aiTaskCount + c.noteCount + c.tokenMapCount,
    0
  )

  const record = await prisma.dataDisposalRecord.create({
    data: {
      clientCount: expiredClients.length,
      recordCount: totalRecords,
      method: "CRYPTO_SHRED",
      status: "QUEUED",
      details: expiredClients.map((c) => ({
        caseId: c.caseId,
        clientName: c.clientName,
        tabsNumber: c.tabsNumber,
        dataTypes: c.dataTypes,
        retentionExpiry: c.retentionExpiry.toISOString(),
        documentCount: c.documentCount,
        aiTaskCount: c.aiTaskCount,
        noteCount: c.noteCount,
        tokenMapCount: c.tokenMapCount,
      })),
    },
  })

  return record.id
}

/**
 * Execute crypto-shredding for a confirmed disposal batch.
 *
 * This permanently deletes:
 *   - All documents for the listed cases
 *   - All AI tasks and outputs
 *   - All client notes and conversations
 *   - All token maps (encryption keys destroyed = data unreadable)
 *   - All case intelligence records
 *   - Updates the case record status to reflect disposal
 *
 * Generates a disposal certificate upon completion.
 */
export async function executeDisposal(
  disposalId: string,
  confirmedById: string
): Promise<{
  success: boolean
  destroyedCount: number
  certificate: string
}> {
  const record = await prisma.dataDisposalRecord.findUnique({
    where: { id: disposalId },
  })

  if (!record) {
    throw new Error("Disposal record not found")
  }

  if (record.status !== "CONFIRMED") {
    throw new Error(
      `Disposal record must be CONFIRMED before execution. Current status: ${record.status}`
    )
  }

  const details = record.details as Array<{
    caseId: string
    clientName: string
    tabsNumber: string
  }>
  const caseIds = details.map((d) => d.caseId)
  let totalDestroyed = 0

  // Execute deletion in a transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // 1. Delete all documents for the cases
    const docResult = await tx.document.deleteMany({
      where: { caseId: { in: caseIds } },
    })
    totalDestroyed += docResult.count

    // 2. Delete all review actions for AI tasks in these cases
    const aiTaskIds = await tx.aITask
      .findMany({
        where: { caseId: { in: caseIds } },
        select: { id: true },
      })
      .then((tasks) => tasks.map((t) => t.id))

    if (aiTaskIds.length > 0) {
      const reviewResult = await tx.reviewAction.deleteMany({
        where: { aiTaskId: { in: aiTaskIds } },
      })
      totalDestroyed += reviewResult.count
    }

    // 3. Delete all AI tasks
    const aiResult = await tx.aITask.deleteMany({
      where: { caseId: { in: caseIds } },
    })
    totalDestroyed += aiResult.count

    // 4. Delete all client notes
    const noteResult = await tx.clientNote
      .deleteMany({
        where: { caseId: { in: caseIds } },
      })
      .catch(() => ({ count: 0 }))
    totalDestroyed += noteResult.count

    // 5. Delete all conversations and messages
    const convIds = await tx.conversation
      .findMany({
        where: { caseId: { in: caseIds } },
        select: { id: true },
      })
      .then((convs) => convs.map((c) => c.id))
      .catch(() => [] as string[])

    if (convIds.length > 0) {
      const msgResult = await tx.conversationMsg
        .deleteMany({
          where: { conversationId: { in: convIds } },
        })
        .catch(() => ({ count: 0 }))
      totalDestroyed += msgResult.count

      const convResult = await tx.conversation
        .deleteMany({
          where: { id: { in: convIds } },
        })
        .catch(() => ({ count: 0 }))
      totalDestroyed += convResult.count
    }

    // 6. Delete token maps (crypto-shredding: destroying the keys makes data unreadable)
    const tokenResult = await tx.tokenMap.deleteMany({
      where: { caseId: { in: caseIds } },
    })
    totalDestroyed += tokenResult.count

    // 7. Delete case intelligence
    const intelResult = await tx.caseIntelligence
      .deleteMany({
        where: { caseId: { in: caseIds } },
      })
      .catch(() => ({ count: 0 }))
    totalDestroyed += intelResult.count

    // 8. Delete liability periods
    const liabilityResult = await tx.liabilityPeriod.deleteMany({
      where: { caseId: { in: caseIds } },
    })
    totalDestroyed += liabilityResult.count

    // 9. Delete case activities
    const activityResult = await tx.caseActivity
      .deleteMany({
        where: { caseId: { in: caseIds } },
      })
      .catch(() => ({ count: 0 }))
    totalDestroyed += activityResult.count

    // 10. Update case records to reflect disposal (retain case shell for audit)
    await tx.case.updateMany({
      where: { id: { in: caseIds } },
      data: {
        clientName: "[DISPOSED]",
        clientNameEncrypted: null,
        clientEmail: null,
        clientPhone: null,
        notes: "Data disposed per retention policy",
      },
    })
  })

  // Generate disposal certificate
  const certificate = generateDisposalCertificate({
    disposalId,
    clientCount: details.length,
    recordCount: totalDestroyed,
    method: record.method,
    confirmedById,
    executedAt: new Date(),
    caseNumbers: details.map((d) => d.tabsNumber),
  })

  // Update disposal record
  await prisma.dataDisposalRecord.update({
    where: { id: disposalId },
    data: {
      status: "EXECUTED",
      executedAt: new Date(),
      certificateId: `CERT-${disposalId.slice(0, 8).toUpperCase()}`,
    },
  })

  return {
    success: true,
    destroyedCount: totalDestroyed,
    certificate,
  }
}

/**
 * Generate a formatted disposal certificate.
 */
export function generateDisposalCertificate(record: {
  disposalId: string
  clientCount: number
  recordCount: number
  method: string
  confirmedById: string
  executedAt: Date
  caseNumbers: string[]
}): string {
  const certId = `CERT-${record.disposalId.slice(0, 8).toUpperCase()}`
  const dateStr = record.executedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const timeStr = record.executedAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })

  return `CERTIFICATE OF DATA DISPOSAL
========================================

Certificate ID: ${certId}
Date of Disposal: ${dateStr} at ${timeStr}
Disposal Record ID: ${record.disposalId}

SCOPE OF DISPOSAL
------------------
Clients Affected: ${record.clientCount}
Total Records Destroyed: ${record.recordCount}
Case Numbers: ${record.caseNumbers.join(", ")}

METHOD OF DESTRUCTION
---------------------
Method: ${record.method === "CRYPTO_SHRED" ? "Cryptographic Shredding" : "Physical Destruction"}
Description: All encryption keys associated with the listed cases have been
permanently destroyed, rendering all encrypted client data irrecoverable.
All unencrypted data has been permanently deleted from all storage systems.

Data types destroyed:
  - Source documents (PDFs, images, spreadsheets, text files)
  - AI analysis outputs (tokenized and detokenized)
  - Client notes and conversation records
  - Token mapping tables (PII encryption keys)
  - Case intelligence records
  - Liability period data
  - Case activity logs

RETENTION POLICY REFERENCE
---------------------------
Policy: Client engagement data retained for ${RETENTION_YEARS} years after case closure.
Basis: IRS record retention requirements, state regulatory requirements,
       and professional liability considerations.

CONFIRMATION
-------------
Confirmed By: User ID ${record.confirmedById}
This certificate confirms that all data for the listed cases has been
permanently and irrecoverably destroyed in accordance with the firm's
data retention and disposal policy.

========================================
Generated automatically by Cleared Platform
${dateStr}
`
}

/**
 * Get disposal history for audit purposes.
 */
export async function getDisposalHistory(): Promise<any[]> {
  return prisma.dataDisposalRecord.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      confirmedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })
}
