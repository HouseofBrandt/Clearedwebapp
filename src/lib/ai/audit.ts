import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

interface AuditLogEntry {
  aiTaskId?: string
  practitionerId?: string
  caseId?: string
  action: string
  metadata?: Record<string, any>
}

export async function createAuditLog(entry: AuditLogEntry) {
  return prisma.auditLog.create({
    data: {
      aiTaskId: entry.aiTaskId || null,
      practitionerId: entry.practitionerId || null,
      caseId: entry.caseId || null,
      action: entry.action,
      metadata: (entry.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  })
}

export async function logAIRequest(params: {
  aiTaskId: string
  practitionerId: string
  caseId: string
  model: string
  requestId: string
  systemPromptVersion: string
  inputTokens: number
  outputTokens: number
}) {
  return createAuditLog({
    aiTaskId: params.aiTaskId,
    practitionerId: params.practitionerId,
    caseId: params.caseId,
    action: "AI_REQUEST",
    metadata: {
      model: params.model,
      requestId: params.requestId,
      systemPromptVersion: params.systemPromptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    },
  })
}

export async function logReviewAction(params: {
  aiTaskId: string
  practitionerId: string
  caseId: string
  action: string
  reviewNotes?: string
}) {
  return createAuditLog({
    aiTaskId: params.aiTaskId,
    practitionerId: params.practitionerId,
    caseId: params.caseId,
    action: `REVIEW_${params.action}`,
    metadata: {
      reviewNotes: params.reviewNotes,
    },
  })
}
