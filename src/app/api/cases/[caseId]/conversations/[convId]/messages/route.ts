import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { notify } from "@/lib/notifications"

// ─── Zod schema ────────────────────────────────────────────

const createMessageSchema = z.object({
  content: z.string().min(1, "Message content is required"),
})

// ─── Helper: Parse @mentions ───────────────────────────────

async function parseMentions(content: string): Promise<string[]> {
  // Match @FirstName LastName or @username patterns
  const mentionPatterns = [
    /@([A-Za-z]+ [A-Za-z]+)/g,
    /@(\w+)/g,
  ]

  const mentionedNames = new Set<string>()
  for (const pattern of mentionPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      mentionedNames.add(match[1])
    }
  }

  if (mentionedNames.size === 0) return []

  // Look up users by name
  const userIds: string[] = []
  for (const name of Array.from(mentionedNames)) {
    const user = await prisma.user.findFirst({
      where: {
        name: { contains: name, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (user) {
      userIds.push(user.id)
    }
  }

  return userIds
}

// ─── GET: List messages for a conversation ─────────────────

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
    select: { id: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 200)
  const offset = parseInt(url.searchParams.get("offset") || "0", 10)

  const [messages, total] = await Promise.all([
    prisma.conversationMsg.findMany({
      where: { conversationId: params.convId, isDeleted: false },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.conversationMsg.count({
      where: { conversationId: params.convId, isDeleted: false },
    }),
  ])

  return NextResponse.json({
    messages,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  })
}

// ─── POST: Add a message ──────────────────────────────────

export async function POST(
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

  const parsed = createMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { content } = parsed.data

  try {
    // Create the message
    const message = await prisma.conversationMsg.create({
      data: {
        conversationId: params.convId,
        authorId: auth.userId,
        content,
        isEdited: false,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    })

    // Parse @mentions and add to participants
    const mentionedUserIds = await parseMentions(content)
    const currentParticipants = new Set(conversation.participants)
    currentParticipants.add(auth.userId)

    let newParticipants: string[] = []
    for (const uid of mentionedUserIds) {
      if (!currentParticipants.has(uid)) {
        currentParticipants.add(uid)
        newParticipants.push(uid)
      }
    }

    // Update conversation: add new participants, bump updatedAt
    await prisma.conversation.update({
      where: { id: params.convId },
      data: {
        participants: Array.from(currentParticipants),
        updatedAt: new Date(),
      },
    })

    // Notify mentioned users
    const caseData = await prisma.case.findUnique({
      where: { id: params.caseId },
      select: { tabsNumber: true },
    })

    for (const uid of mentionedUserIds) {
      if (uid !== auth.userId) {
        notify({
          recipientId: uid,
          type: "CASE_ACTIVITY",
          subject: `Mentioned in conversation: ${conversation.subject}`,
          body: `${auth.name} mentioned you in a conversation on case ${caseData?.tabsNumber || params.caseId}`,
          caseId: params.caseId,
          senderId: auth.userId,
          senderName: auth.name,
        })
      }
    }

    // Notify existing participants (except author and newly mentioned)
    const mentionedSet = new Set(mentionedUserIds)
    for (const pid of conversation.participants) {
      if (pid !== auth.userId && !mentionedSet.has(pid)) {
        notify({
          recipientId: pid,
          type: "CASE_ACTIVITY",
          subject: `New message in: ${conversation.subject}`,
          body: `${auth.name} posted in conversation "${conversation.subject}" on case ${caseData?.tabsNumber || params.caseId}`,
          caseId: params.caseId,
          senderId: auth.userId,
          senderName: auth.name,
        })
      }
    }

    // Audit log
    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.CONVERSATION_MESSAGE_POSTED,
      caseId: params.caseId,
      resourceId: message.id,
      resourceType: "ConversationMsg",
      metadata: {
        conversationId: params.convId,
        messageId: message.id,
        mentionedUsers: mentionedUserIds,
        newParticipants,
      },
      ipAddress: getClientIP(),
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error("Create message error:", error)
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 })
  }
}
