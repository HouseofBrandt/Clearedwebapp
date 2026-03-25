import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"

// ─── Zod schema ────────────────────────────────────────────

const updateConversationSchema = z.object({
  subject: z.string().min(1).optional(),
  status: z.enum(["OPEN", "RESOLVED", "ARCHIVED"]).optional(),
  priority: z.enum(["NORMAL", "URGENT", "FYI"]).optional(),
  participants: z.array(z.string()).optional(),
  relatedTaxYears: z.array(z.number().int().min(1900).max(2100)).optional(),
  relatedFeature: z.enum([
    "TRANSCRIPT_DECODER", "CASE_INTELLIGENCE", "PENALTY_ABATEMENT",
    "OIC", "COMPLIANCE", "DEADLINE_TRACKER", "GENERAL",
  ]).optional().nullable(),
})

// ─── GET: Single conversation with messages ────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string; convId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.convId, caseId: params.caseId },
    include: {
      startedBy: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true } },
      messages: {
        where: { isDeleted: false },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json(conversation)
}

// ─── PATCH: Update conversation ────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string; convId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.convId, caseId: params.caseId },
  })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = updateConversationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const updateData: any = {}

  if (data.subject !== undefined) updateData.subject = data.subject
  if (data.priority !== undefined) updateData.priority = data.priority
  if (data.participants !== undefined) updateData.participants = data.participants
  if (data.relatedTaxYears !== undefined) updateData.relatedTaxYears = data.relatedTaxYears
  if (data.relatedFeature !== undefined) updateData.relatedFeature = data.relatedFeature

  // Handle status transitions
  if (data.status !== undefined) {
    updateData.status = data.status

    if (data.status === "RESOLVED") {
      updateData.resolvedAt = new Date()
      updateData.resolvedById = auth.userId
    } else if (data.status === "OPEN" && conversation.status === "RESOLVED") {
      // Reopening — clear resolved fields
      updateData.resolvedAt = null
      updateData.resolvedById = null
    }
  }

  try {
    const updated = await prisma.conversation.update({
      where: { id: params.convId },
      data: updateData,
      include: {
        startedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    })

    // Audit log for status changes
    if (data.status === "RESOLVED") {
      logAudit({
        userId: auth.userId,
        action: AUDIT_ACTIONS.CONVERSATION_RESOLVED,
        caseId: params.caseId,
        resourceId: params.convId,
        resourceType: "Conversation",
        metadata: { conversationId: params.convId, subject: conversation.subject },
        ipAddress: getClientIP(),
      })
    } else if (data.status === "ARCHIVED") {
      logAudit({
        userId: auth.userId,
        action: AUDIT_ACTIONS.CONVERSATION_ARCHIVED,
        caseId: params.caseId,
        resourceId: params.convId,
        resourceType: "Conversation",
        metadata: { conversationId: params.convId, subject: conversation.subject },
        ipAddress: getClientIP(),
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update conversation error:", error)
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 })
  }
}
