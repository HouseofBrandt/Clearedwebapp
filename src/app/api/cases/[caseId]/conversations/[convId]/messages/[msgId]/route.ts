import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"

// ─── Zod schema ────────────────────────────────────────────

const updateMessageSchema = z.object({
  content: z.string().min(1, "Message content is required"),
})

// ─── PATCH: Edit a message (author only or ADMIN) ──────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string; convId: string; msgId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const message = await prisma.conversationMsg.findFirst({
    where: {
      id: params.msgId,
      conversationId: params.convId,
      isDeleted: false,
    },
    include: {
      conversation: { select: { caseId: true } },
    },
  })

  if (!message || message.conversation.caseId !== params.caseId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  // Only author or ADMIN can edit
  if (message.authorId !== auth.userId && auth.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the author or an admin can edit this message" },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = updateMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const updated = await prisma.conversationMsg.update({
      where: { id: params.msgId },
      data: {
        content: parsed.data.content,
        isEdited: true,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    })

    await logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.CONVERSATION_MESSAGE_EDITED,
      caseId: params.caseId,
      resourceId: params.msgId,
      resourceType: "ConversationMsg",
      metadata: {
        conversationId: params.convId,
        messageId: params.msgId,
        contentBefore: message.content.slice(0, 200),
        contentAfter: parsed.data.content.slice(0, 200),
      },
      ipAddress: getClientIP(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Edit message error:", error)
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 })
  }
}

// ─── DELETE: Soft delete a message ─────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string; convId: string; msgId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const message = await prisma.conversationMsg.findFirst({
    where: {
      id: params.msgId,
      conversationId: params.convId,
      isDeleted: false,
    },
    include: {
      conversation: { select: { caseId: true } },
    },
  })

  if (!message || message.conversation.caseId !== params.caseId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  // Only author or ADMIN can delete
  if (message.authorId !== auth.userId && auth.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the author or an admin can delete this message" },
      { status: 403 }
    )
  }

  try {
    await prisma.conversationMsg.update({
      where: { id: params.msgId },
      data: { isDeleted: true },
    })

    await logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.CONVERSATION_MESSAGE_DELETED,
      caseId: params.caseId,
      resourceId: params.msgId,
      resourceType: "ConversationMsg",
      metadata: {
        conversationId: params.convId,
        messageId: params.msgId,
        action: "soft_delete",
      },
      ipAddress: getClientIP(),
    })

    return NextResponse.json({ message: "Message deleted" })
  } catch (error) {
    console.error("Delete message error:", error)
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 })
  }
}
