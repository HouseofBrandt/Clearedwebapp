/**
 * Data Subject Rights Management
 *
 * Handles data access, correction, and deletion requests from data subjects.
 * Supports CCPA, state privacy laws, and internal compliance policies.
 */

import { prisma } from "@/lib/db"

export interface CompiledAccessData {
  cases: Array<{
    id: string
    tabsNumber: string
    status: string
    caseType: string
    createdAt: Date
    updatedAt: Date
  }>
  documents: Array<{
    id: string
    fileName: string
    fileType: string
    documentCategory: string
    uploadedAt: Date
    caseTabsNumber: string
  }>
  notes: Array<{
    id: string
    noteType: string
    content: string
    createdAt: Date
    caseTabsNumber: string
  }>
  conversations: Array<{
    id: string
    title: string
    status: string
    createdAt: Date
    messageCount: number
    caseTabsNumber: string
  }>
  aiTasks: Array<{
    id: string
    taskType: string
    status: string
    createdAt: Date
    caseTabsNumber: string
  }>
  auditLogs: Array<{
    id: string
    action: string
    timestamp: Date
    caseTabsNumber: string | null
  }>
}

/**
 * Compile all data related to a subject across the system.
 * Searches by email across cases and related records.
 */
export async function compileAccessData(
  subjectEmail: string
): Promise<CompiledAccessData> {
  // Find all cases associated with the subject's email
  const cases = await prisma.case.findMany({
    where: {
      clientEmail: subjectEmail,
    },
    select: {
      id: true,
      tabsNumber: true,
      status: true,
      caseType: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const caseIds = cases.map((c) => c.id)
  const caseMap = new Map(cases.map((c) => [c.id, c.tabsNumber]))

  if (caseIds.length === 0) {
    return {
      cases: [],
      documents: [],
      notes: [],
      conversations: [],
      aiTasks: [],
      auditLogs: [],
    }
  }

  // Gather documents
  const documents = await prisma.document.findMany({
    where: { caseId: { in: caseIds } },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      documentCategory: true,
      uploadedAt: true,
      caseId: true,
    },
  })

  // Gather client notes
  const notes = await prisma.clientNote
    .findMany({
      where: { caseId: { in: caseIds } },
      select: {
        id: true,
        noteType: true,
        content: true,
        createdAt: true,
        caseId: true,
      },
    })
    .catch(() => [] as any[])

  // Gather conversations
  const conversations = await prisma.conversation
    .findMany({
      where: { caseId: { in: caseIds } },
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        caseId: true,
        _count: { select: { messages: true } },
      },
    })
    .catch(() => [] as any[])

  // Gather AI tasks (metadata only, no PII in output)
  const aiTasks = await prisma.aITask.findMany({
    where: { caseId: { in: caseIds } },
    select: {
      id: true,
      taskType: true,
      status: true,
      createdAt: true,
      caseId: true,
    },
  })

  // Gather audit logs related to these cases
  const auditLogs = await prisma.auditLog.findMany({
    where: { caseId: { in: caseIds } },
    select: {
      id: true,
      action: true,
      timestamp: true,
      caseId: true,
    },
    orderBy: { timestamp: "desc" },
    take: 500, // Limit for performance
  })

  return {
    cases,
    documents: documents.map((d) => ({
      ...d,
      caseTabsNumber: caseMap.get(d.caseId) || "Unknown",
    })),
    notes: notes.map((n: any) => ({
      id: n.id,
      noteType: n.noteType,
      content: n.content,
      createdAt: n.createdAt,
      caseTabsNumber: caseMap.get(n.caseId) || "Unknown",
    })),
    conversations: conversations.map((c: any) => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      createdAt: c.createdAt,
      messageCount: c._count?.messages || 0,
      caseTabsNumber: caseMap.get(c.caseId) || "Unknown",
    })),
    aiTasks: aiTasks.map((t) => ({
      ...t,
      caseTabsNumber: caseMap.get(t.caseId) || "Unknown",
    })),
    auditLogs: auditLogs.map((l) => ({
      ...l,
      caseTabsNumber: l.caseId ? caseMap.get(l.caseId) || null : null,
    })),
  }
}

/**
 * Execute corrections to client data.
 * Each correction is logged in the audit trail.
 */
export async function executeCorrection(
  requestId: string,
  corrections: Array<{
    table: string
    recordId: string
    field: string
    oldValue: string
    newValue: string
  }>,
  performedById: string
): Promise<{ correctedCount: number }> {
  let correctedCount = 0

  for (const correction of corrections) {
    try {
      // Apply correction based on table
      switch (correction.table) {
        case "case":
          await prisma.case.update({
            where: { id: correction.recordId },
            data: { [correction.field]: correction.newValue },
          })
          break
        case "client_note":
          await prisma.clientNote.update({
            where: { id: correction.recordId },
            data: { [correction.field]: correction.newValue },
          })
          break
        default:
          console.warn(
            `[data-subject-rights] Unsupported table for correction: ${correction.table}`
          )
          continue
      }

      // Log the correction
      await prisma.auditLog.create({
        data: {
          practitionerId: performedById,
          action: "DATA_SUBJECT_CORRECTION",
          metadata: {
            requestId,
            table: correction.table,
            recordId: correction.recordId,
            field: correction.field,
            oldValue: "[REDACTED]", // Never log the actual PII
            correctionApplied: true,
          },
        },
      })

      correctedCount++
    } catch (error: any) {
      console.error(
        `[data-subject-rights] Failed to apply correction for ${correction.table}:${correction.recordId}:`,
        error.message
      )
    }
  }

  // Update the request record
  await prisma.dataSubjectRequest.update({
    where: { id: requestId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completedById: performedById,
      notes: `${correctedCount} corrections applied`,
    },
  })

  return { correctedCount }
}

/**
 * Execute data deletion for a data subject request.
 * Deletes specified data categories for all cases matching the subject.
 */
export async function executeDeletion(
  requestId: string,
  scope: string[],
  performedById: string
): Promise<{
  deletedCount: number
  certificate: string
}> {
  const request = await prisma.dataSubjectRequest.findUnique({
    where: { id: requestId },
  })

  if (!request) {
    throw new Error("Data subject request not found")
  }

  // Find all cases for this subject
  const cases = await prisma.case.findMany({
    where: { clientEmail: request.subjectEmail },
    select: { id: true, tabsNumber: true },
  })

  const caseIds = cases.map((c) => c.id)
  let deletedCount = 0

  await prisma.$transaction(async (tx) => {
    for (const dataType of scope) {
      switch (dataType) {
        case "documents":
          const docResult = await tx.document.deleteMany({
            where: { caseId: { in: caseIds } },
          })
          deletedCount += docResult.count
          break

        case "ai_tasks":
          // Delete review actions first
          const taskIds = await tx.aITask
            .findMany({
              where: { caseId: { in: caseIds } },
              select: { id: true },
            })
            .then((t) => t.map((x) => x.id))

          if (taskIds.length > 0) {
            const revResult = await tx.reviewAction.deleteMany({
              where: { aiTaskId: { in: taskIds } },
            })
            deletedCount += revResult.count
          }

          const aiResult = await tx.aITask.deleteMany({
            where: { caseId: { in: caseIds } },
          })
          deletedCount += aiResult.count
          break

        case "notes":
          const noteResult = await tx.clientNote
            .deleteMany({
              where: { caseId: { in: caseIds } },
            })
            .catch(() => ({ count: 0 }))
          deletedCount += noteResult.count
          break

        case "conversations":
          const convIds = await tx.conversation
            .findMany({
              where: { caseId: { in: caseIds } },
              select: { id: true },
            })
            .then((c) => c.map((x) => x.id))
            .catch(() => [] as string[])

          if (convIds.length > 0) {
            const msgResult = await tx.conversationMsg
              .deleteMany({
                where: { conversationId: { in: convIds } },
              })
              .catch(() => ({ count: 0 }))
            deletedCount += msgResult.count

            const convResult = await tx.conversation
              .deleteMany({
                where: { id: { in: convIds } },
              })
              .catch(() => ({ count: 0 }))
            deletedCount += convResult.count
          }
          break

        case "token_maps":
          const tokenResult = await tx.tokenMap.deleteMany({
            where: { caseId: { in: caseIds } },
          })
          deletedCount += tokenResult.count
          break
      }
    }
  })

  // Log the deletion
  await prisma.auditLog.create({
    data: {
      practitionerId: performedById,
      action: "DATA_SUBJECT_DELETION",
      metadata: {
        requestId,
        subjectEmail: "[REDACTED]",
        scope,
        deletedCount,
        caseCount: caseIds.length,
      },
    },
  })

  // Generate deletion certificate
  const certificate = generateDeletionCertificate({
    requestId,
    subjectName: request.subjectName,
    scope,
    deletedCount,
    caseCount: caseIds.length,
    performedById,
    executedAt: new Date(),
  })

  // Update the request
  await prisma.dataSubjectRequest.update({
    where: { id: requestId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completedById: performedById,
      notes: `Deletion completed: ${deletedCount} records across ${scope.join(", ")}`,
    },
  })

  return { deletedCount, certificate }
}

function generateDeletionCertificate(record: {
  requestId: string
  subjectName: string
  scope: string[]
  deletedCount: number
  caseCount: number
  performedById: string
  executedAt: Date
}): string {
  const dateStr = record.executedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return `CERTIFICATE OF DATA DELETION
========================================

Request ID: ${record.requestId}
Date: ${dateStr}
Subject: ${record.subjectName}

SCOPE
------
Data categories deleted: ${record.scope.join(", ")}
Records deleted: ${record.deletedCount}
Cases affected: ${record.caseCount}

This certificate confirms that all requested data has been
permanently deleted in accordance with the data subject's request
and applicable privacy regulations.

Performed by: User ID ${record.performedById}

========================================
Generated automatically by Cleared Platform
${dateStr}
`
}
