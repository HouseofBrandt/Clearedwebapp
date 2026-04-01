import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { notify } from "@/lib/notifications"
import { createFeedEvent } from "@/lib/feed/create-event"

// ─── Zod schemas ───────────────────────────────────────────

const createConversationSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  priority: z.enum(["NORMAL", "URGENT", "FYI"]).default("NORMAL"),
  relatedTaxYears: z.array(z.number().int().min(1900).max(2100)).optional(),
  relatedFeature: z.enum([
    "TRANSCRIPT_DECODER", "CASE_INTELLIGENCE", "PENALTY_ABATEMENT",
    "OIC", "COMPLIANCE", "DEADLINE_TRACKER", "GENERAL",
  ]).optional().nullable(),
  initialMessage: z.string().min(1).optional(),
})

// ─── GET: List conversations for a case ────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const priority = url.searchParams.get("priority")
  const participant = url.searchParams.get("participant")
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100)
  const offset = parseInt(url.searchParams.get("offset") || "0", 10)

  const VALID_STATUSES = ["OPEN", "RESOLVED", "ARCHIVED"]
  const VALID_PRIORITIES = ["NORMAL", "URGENT", "FYI"]

  const where: any = { caseId: params.caseId }
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status '${status}'` }, { status: 400 })
    }
    where.status = status
  }
  if (priority) {
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: `Invalid priority '${priority}'` }, { status: 400 })
    }
    where.priority = priority
  }
  if (participant) where.participants = { has: participant }

  try {
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          startedBy: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { isDeleted: false },
            include: {
              author: { select: { id: true, name: true } },
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.conversation.count({ where }),
    ])

    // Transform to include message count and last message preview
    const result = conversations.map((conv) => ({
      ...conv,
      messageCount: conv._count.messages,
      lastMessage: conv.messages[0] || null,
      messages: undefined,
      _count: undefined,
    }))

    return NextResponse.json({
      conversations: result,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error: any) {
    console.error("[Conversations GET] Error:", {
      caseId: params.caseId,
      error: error.message,
      code: error.code,
    })
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    )
  }
}

// ─── POST: Create a conversation ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createConversationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  try {
    // Auto-add creator to participants
    const participants = [auth.userId]

    const conversation = await prisma.conversation.create({
      data: {
        caseId: params.caseId,
        startedById: auth.userId,
        subject: data.subject,
        priority: data.priority,
        relatedTaxYears: data.relatedTaxYears || [],
        relatedFeature: data.relatedFeature || null,
        participants,
      },
      include: {
        startedBy: { select: { id: true, name: true } },
      },
    })

    // Create initial message if provided
    if (data.initialMessage) {
      await prisma.conversationMsg.create({
        data: {
          conversationId: conversation.id,
          authorId: auth.userId,
          content: data.initialMessage,
        },
      })
    }

    // Audit log
    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.CONVERSATION_CREATED,
      caseId: params.caseId,
      resourceId: conversation.id,
      resourceType: "Conversation",
      metadata: {
        conversationId: conversation.id,
        subject: data.subject,
        priority: data.priority,
      },
      ipAddress: getClientIP(),
    })

    // Notify assigned practitioners on the case
    const caseData = await prisma.case.findUnique({
      where: { id: params.caseId },
      select: { assignedPractitionerId: true, tabsNumber: true },
    })

    if (caseData?.assignedPractitionerId && caseData.assignedPractitionerId !== auth.userId) {
      notify({
        recipientId: caseData.assignedPractitionerId,
        type: "CASE_NOTE",
        subject: `New conversation: ${data.subject}`,
        body: `${auth.name} started a conversation on case ${caseData.tabsNumber}: "${data.subject}"`,
        priority: data.priority === "URGENT" ? "URGENT" : "NORMAL",
        caseId: params.caseId,
        senderId: auth.userId,
        senderName: auth.name,
      })
    }

    // Feed event
    createFeedEvent({
      eventType: "conversation_created",
      caseId: params.caseId,
      content: `${auth.name} started a conversation: ${data.subject}`,
      sourceType: "conversation",
      sourceId: conversation.id,
      eventData: {
        conversationId: conversation.id,
        subject: data.subject,
        authorName: auth.name,
      },
    })

    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    console.error("Create conversation error:", error)
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
  }
}
