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

// ═══════════════════════════════════════════════════
// COMPREHENSIVE AUDIT ACTIONS — SOC 2 Compliance
// ═══════════════════════════════════════════════════

export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",

  // User management
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",

  // Case operations
  CASE_CREATED: "CASE_CREATED",
  CASE_UPDATED: "CASE_UPDATED",
  CASE_DELETED: "CASE_DELETED",
  CASE_VIEWED: "CASE_VIEWED",
  CASE_STATUS_CHANGED: "CASE_STATUS_CHANGED",

  // Document operations
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  DOCUMENT_VIEWED: "DOCUMENT_VIEWED",
  DOCUMENT_DOWNLOADED: "DOCUMENT_DOWNLOADED",
  DOCUMENT_DELETED: "DOCUMENT_DELETED",
  DOCUMENT_CATEGORY_CHANGED: "DOCUMENT_CATEGORY_CHANGED",

  // AI operations
  AI_REQUEST: "AI_REQUEST",
  AI_COMPLETED: "AI_COMPLETED",
  AI_FAILED: "AI_FAILED",

  // Review operations
  REVIEW_APPROVED: "REVIEW_APPROVED",
  REVIEW_REJECTED: "REVIEW_REJECTED",
  REVIEW_EDIT_APPROVED: "REVIEW_EDIT_APPROVED",

  // Export operations
  DELIVERABLE_EXPORTED: "DELIVERABLE_EXPORTED",
  MESSAGES_EXPORTED: "MESSAGES_EXPORTED",

  // Knowledge base
  KB_DOCUMENT_UPLOADED: "KB_DOCUMENT_UPLOADED",
  KB_DOCUMENT_DELETED: "KB_DOCUMENT_DELETED",
  KB_OUTPUT_ADDED: "KB_OUTPUT_ADDED",

  // PII operations
  PII_TOKENIZED: "PII_TOKENIZED",
  PII_DETOKENIZED: "PII_DETOKENIZED",
  TOKEN_MAP_ACCESSED: "TOKEN_MAP_ACCESSED",
  ENCRYPTION_PERFORMED: "ENCRYPTION_PERFORMED",

  // Messaging
  MESSAGE_SENT: "MESSAGE_SENT",
  BUG_REPORT_SUBMITTED: "BUG_REPORT_SUBMITTED",
  FEATURE_REQUEST_SUBMITTED: "FEATURE_REQUEST_SUBMITTED",

  // Security operations
  LOGIN_FAILED: "LOGIN_FAILED",
  RATE_LIMIT_HIT: "RATE_LIMIT_HIT",
  UNAUTHORIZED_ACCESS_ATTEMPT: "UNAUTHORIZED_ACCESS_ATTEMPT",
  EXPORT_GENERATED: "EXPORT_GENERATED",

  // Deadline operations
  DEADLINE_CREATED: "DEADLINE_CREATED",
  DEADLINE_UPDATED: "DEADLINE_UPDATED",
  DEADLINE_DELETED: "DEADLINE_DELETED",

  // Notes operations
  NOTE_CREATED: "NOTE_CREATED",
  NOTE_EDITED: "NOTE_EDITED",
  NOTE_DELETED: "NOTE_DELETED",
  NOTE_PINNED: "NOTE_PINNED",
  NOTE_UNPINNED: "NOTE_UNPINNED",

  // Conversation operations
  CONVERSATION_CREATED: "CONVERSATION_CREATED",
  CONVERSATION_RESOLVED: "CONVERSATION_RESOLVED",
  CONVERSATION_ARCHIVED: "CONVERSATION_ARCHIVED",
  CONVERSATION_MESSAGE_POSTED: "CONVERSATION_MESSAGE_POSTED",
  CONVERSATION_MESSAGE_EDITED: "CONVERSATION_MESSAGE_EDITED",

  // AI context
  AI_CONTEXT_ASSEMBLED: "AI_CONTEXT_ASSEMBLED",
  AI_RESPONSE_APPROVED: "AI_RESPONSE_APPROVED",
} as const

/**
 * Log any audit event. Fire-and-forget — callers should NOT
 * await this. Failures are logged to console but never block
 * the calling operation.
 */
export function logAudit(params: {
  userId: string
  action: string
  caseId?: string
  aiTaskId?: string
  resourceId?: string
  resourceType?: string
  metadata?: Record<string, any>
  ipAddress?: string
}) {
  return prisma.auditLog.create({
    data: {
      practitionerId: params.userId,
      action: params.action,
      caseId: params.caseId || null,
      aiTaskId: params.aiTaskId || null,
      metadata: {
        resourceId: params.resourceId,
        resourceType: params.resourceType,
        ipAddress: params.ipAddress,
        timestamp: new Date().toISOString(),
        ...params.metadata,
      } as any,
    },
  }).catch((err) => {
    console.error(`[Audit] Failed to log ${params.action}:`, err.message)
  })
}

/**
 * Extract client IP from request headers.
 * Safe to call in API routes and server components.
 */
export function getClientIP(headersList?: Headers): string {
  let hdrs: Headers | undefined = headersList
  if (!hdrs) {
    try {
      const { headers } = require("next/headers")
      hdrs = headers() as Headers
    } catch {
      return "unknown"
    }
  }
  if (!hdrs) return "unknown"
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-real-ip")
    || "unknown"
}
