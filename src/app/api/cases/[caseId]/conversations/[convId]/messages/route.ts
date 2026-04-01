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
  attachmentIds: z.array(z.string()).optional(),
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

  // Filter out single-word matches that are substrings of multi-word matches
  const multiWordMatches = Array.from(mentionedNames).filter((name) => name.includes(" "))
  for (const name of Array.from(mentionedNames)) {
    if (!name.includes(" ") && multiWordMatches.some((mw) => mw.toLowerCase().includes(name.toLowerCase()))) {
      mentionedNames.delete(name)
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

  try {
    // Try with attachments first; fall back without if the table doesn't exist
    let messages: any[]
    let total: number

    try {
      ;[messages, total] = await Promise.all([
        prisma.conversationMsg.findMany({
          where: { conversationId: params.convId, isDeleted: false },
          include: {
            author: { select: { id: true, name: true, email: true } },
            attachments: true,
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          skip: offset,
        }),
        prisma.conversationMsg.count({
          where: { conversationId: params.convId, isDeleted: false },
        }),
      ])
    } catch (attachErr: any) {
      // P2021 = table doesn't exist, P2022 = column doesn't exist
      if (attachErr.code === "P2021" || attachErr.code === "P2022") {
        console.warn("[Messages GET] Attachments table/column missing, querying without attachments:", attachErr.code)
        ;[messages, total] = await Promise.all([
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
      } else {
        throw attachErr
      }
    }

    return NextResponse.json({
      messages,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error: any) {
    console.error("[Messages GET] Error:", {
      caseId: params.caseId,
      convId: params.convId,
      error: error.message,
      code: error.code,
    })
    return NextResponse.json(
      { error: "Failed to load messages", details: error.message },
      { status: 500 }
    )
  }
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

  const { content, attachmentIds } = parsed.data

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

    // Create attachment records if documentIds were provided
    if (attachmentIds && attachmentIds.length > 0) {
      try {
        // Fetch document info for the attachments
        const documents = await prisma.document.findMany({
          where: {
            id: { in: attachmentIds },
            caseId: params.caseId, // ensure docs belong to this case
          },
          select: { id: true, fileName: true, filePath: true, fileType: true, fileSize: true },
        })

        if (documents.length > 0) {
          await prisma.conversationMsgAttachment.createMany({
            data: documents.map((doc) => ({
              messageId: message.id,
              documentId: doc.id,
              fileName: doc.fileName,
              fileUrl: doc.filePath,
              fileType: doc.fileType as string,
              fileSize: doc.fileSize ?? 0,
            })),
          })
        }
      } catch (attachErr) {
        console.warn("[Messages POST] Attachment creation failed (non-critical):", attachErr)
      }
    }

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

    // Notify mentioned users (non-critical — should not block message creation)
    try {
      const caseData = await prisma.case.findUnique({
        where: { id: params.caseId },
        select: { tabsNumber: true },
      })

      for (const uid of mentionedUserIds) {
        if (uid !== auth.userId) {
          await notify({
            recipientId: uid,
            type: "CASE_ACTIVITY",
            subject: `Mentioned in conversation: ${conversation.subject}`,
            body: `${auth.name} mentioned you in a conversation on case ${caseData?.tabsNumber || params.caseId}`,
            caseId: params.caseId,
            senderId: auth.userId,
            senderName: auth.name,
          }).catch(() => { /* non-critical */ })
        }
      }

      // Notify existing participants (except author and newly mentioned)
      const mentionedSet = new Set(mentionedUserIds)
      for (const pid of conversation.participants) {
        if (pid !== auth.userId && !mentionedSet.has(pid)) {
          await notify({
            recipientId: pid,
            type: "CASE_ACTIVITY",
            subject: `New message in: ${conversation.subject}`,
            body: `${auth.name} posted in conversation "${conversation.subject}" on case ${caseData?.tabsNumber || params.caseId}`,
            caseId: params.caseId,
            senderId: auth.userId,
            senderName: auth.name,
          }).catch(() => { /* non-critical */ })
        }
      }
    } catch (notifyErr) {
      console.warn("[Messages POST] Notification delivery failed (non-critical):", notifyErr)
    }

    // Audit log (non-critical)
    try {
      await logAudit({
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
    } catch {
      // Non-critical: audit logging should not block message creation
    }

    // Re-query to include attachments in the response
    let fullMessage: any
    try {
      fullMessage = await prisma.conversationMsg.findUnique({
        where: { id: message.id },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
      })
    } catch {
      // Fallback without attachments if table doesn't exist
      fullMessage = await prisma.conversationMsg.findUnique({
        where: { id: message.id },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      })
    }

    return NextResponse.json(fullMessage, { status: 201 })
  } catch (error) {
    console.error("Create message error:", error)
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 })
  }
}
