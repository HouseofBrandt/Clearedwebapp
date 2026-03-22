import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { notifyAdmins, notifyAll } from "@/lib/notifications"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"

const sendSchema = z.object({
  recipientId: z.string().min(1),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  type: z.enum([
    "DIRECT_MESSAGE", "BUG_REPORT", "FEATURE_REQUEST",
    "SYSTEM_ANNOUNCEMENT", "CASE_NOTE",
  ]),
  caseId: z.string().optional(),
  deadlineId: z.string().optional(),
  aiTaskId: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  tags: z.array(z.string()).optional(),
  parentId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const unreadOnly = searchParams.get("unreadOnly") === "true"
  const archived = searchParams.get("archived") === "true"

  const where: any = {
    recipientId: auth.userId,
    archived,
  }

  if (type) {
    if (type === "BUGS_AND_FEATURES") {
      where.type = { in: ["BUG_REPORT", "FEATURE_REQUEST"] }
    } else if (type === "NOTIFICATIONS") {
      where.type = { in: ["DEADLINE_REMINDER", "REVIEW_ASSIGNED", "TASK_APPROVED", "TASK_REJECTED", "SYSTEM_ANNOUNCEMENT"] }
    } else {
      where.type = type
    }
  }

  if (unreadOnly) {
    where.read = false
  }

  const [messages, unreadCount] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true } },
        case: { select: { id: true, caseNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.message.count({
      where: { recipientId: auth.userId, read: false, archived: false },
    }),
  ])

  return NextResponse.json({ messages, unreadCount })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = sendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    // Get sender info
    const sender = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true, role: true },
    })

    // System announcements require admin
    if (data.type === "SYSTEM_ANNOUNCEMENT") {
      if (sender?.role !== "ADMIN") {
        return NextResponse.json({ error: "Only admins can send announcements" }, { status: 403 })
      }
      const results = await notifyAll({
        subject: data.subject,
        body: data.body,
        senderId: auth.userId,
        senderName: sender.name,
      })
      return NextResponse.json({ sent: results.length })
    }

    // Bug reports and feature requests go to all admins
    if ((data.type === "BUG_REPORT" || data.type === "FEATURE_REQUEST") && data.recipientId === "admins") {
      const results = await notifyAdmins({
        type: data.type,
        subject: data.subject,
        body: data.body,
        priority: data.priority,
        senderId: auth.userId,
        senderName: sender?.name || "Unknown",
        tags: data.tags,
      })
      return NextResponse.json({ sent: results.length })
    }

    // Direct message or targeted message
    const message = await prisma.message.create({
      data: {
        type: data.type as any,
        priority: (data.priority || "NORMAL") as any,
        subject: data.subject,
        body: data.body,
        recipientId: data.recipientId,
        senderId: auth.userId,
        senderName: sender?.name || "Unknown",
        caseId: data.caseId,
        deadlineId: data.deadlineId,
        aiTaskId: data.aiTaskId,
        tags: data.tags || [],
        parentId: data.parentId,
      },
    })

    const auditAction = data.type === "BUG_REPORT"
      ? AUDIT_ACTIONS.BUG_REPORT_SUBMITTED
      : data.type === "FEATURE_REQUEST"
        ? AUDIT_ACTIONS.FEATURE_REQUEST_SUBMITTED
        : AUDIT_ACTIONS.MESSAGE_SENT
    logAudit({
      userId: auth.userId,
      action: auditAction,
      metadata: { subject: data.subject, type: data.type },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
