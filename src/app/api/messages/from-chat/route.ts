import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { notifyAdmins } from "@/lib/notifications"
import { z } from "zod"

const chatMessageSchema = z.object({
  requestId: z.string().uuid().optional(),
  type: z.enum(["BUG_REPORT", "FEATURE_REQUEST", "DIRECT_MESSAGE"]),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  recipientId: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  tags: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  browserContext: z.object({
    route: z.string().optional(),
    title: z.string().optional(),
    errors: z.array(z.object({
      type: z.string(),
      message: z.string(),
      source: z.string().optional(),
      timestamp: z.number(),
      details: z.string().optional(),
    })).optional(),
    networkFailures: z.array(z.object({
      url: z.string(),
      status: z.number(),
      method: z.string(),
      timestamp: z.number(),
    })).optional(),
  }).optional(),
  userAgent: z.string().optional(),
})

// In-memory set to track processed requestIds for idempotency (per server instance)
const processedRequestIds = new Set<string>()

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = chatMessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    // Idempotency check: reject duplicate requestIds
    if (data.requestId) {
      if (processedRequestIds.has(data.requestId)) {
        return NextResponse.json(
          { error: "Duplicate submission", requestId: data.requestId },
          { status: 409 }
        )
      }
      processedRequestIds.add(data.requestId)
      // Prevent unbounded memory growth — evict old entries after 10,000
      if (processedRequestIds.size > 10000) {
        const first = processedRequestIds.values().next().value
        if (first) processedRequestIds.delete(first)
      }
    }

    const sender = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true },
    })

    // Bug reports and feature requests go to all admins
    if (data.type === "BUG_REPORT" || data.type === "FEATURE_REQUEST") {
      console.log(`[from-chat] Created ${data.type} report: "${data.subject}", notifying admins...`)

      // Build metadata with optional screenshot and browser diagnostics
      const metadata: Record<string, any> = {}
      if (data.screenshot) metadata.screenshot = data.screenshot
      if (data.browserContext) metadata.browserContext = data.browserContext
      if (data.userAgent) metadata.userAgent = data.userAgent

      const results = await notifyAdmins({
        type: data.type,
        subject: data.subject,
        body: data.body,
        priority: data.priority || (data.type === "BUG_REPORT" ? "HIGH" : "NORMAL"),
        senderId: auth.userId,
        senderName: sender?.name || "Unknown",
        tags: data.tags,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      })

      console.log(`[from-chat] Notified ${results.length} admin(s) for ${data.type}: "${data.subject}"`, {
        adminMessageIds: results.map((r: any) => r.id),
        recipientIds: results.map((r: any) => r.recipientId),
      })

      if (results.length === 0) {
        console.warn(`[from-chat] WARNING: No admins received the ${data.type}. Check that users with role=ADMIN exist in the database.`)
        return NextResponse.json(
          { sent: 0, type: data.type, warning: "No admin users found — report was not delivered. Contact your system administrator." },
          { status: 200 }
        )
      }

      return NextResponse.json({ sent: results.length, type: data.type })
    }

    // Direct messages require a recipient
    if (!data.recipientId) {
      return NextResponse.json({ error: "recipientId required for direct messages" }, { status: 400 })
    }

    const message = await prisma.message.create({
      data: {
        type: "DIRECT_MESSAGE",
        priority: (data.priority || "NORMAL") as any,
        subject: data.subject,
        body: data.body,
        recipientId: data.recipientId,
        senderId: auth.userId,
        senderName: sender?.name || "Unknown",
        tags: data.tags || [],
      },
    })

    return NextResponse.json({ sent: 1, messageId: message.id, type: "DIRECT_MESSAGE" })
  } catch (error) {
    console.error("Chat message send error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
