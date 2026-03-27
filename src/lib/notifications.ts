import { prisma } from "@/lib/db"

export async function notify(params: {
  recipientId: string
  type: string
  subject: string
  body: string
  priority?: string
  caseId?: string
  deadlineId?: string
  aiTaskId?: string
  senderId?: string
  senderName?: string
}) {
  return prisma.message.create({
    data: {
      type: params.type as any,
      priority: (params.priority || "NORMAL") as any,
      subject: params.subject,
      body: params.body,
      recipientId: params.recipientId,
      senderId: params.senderId || null,
      senderName: params.senderName || "Cleared System",
      caseId: params.caseId,
      deadlineId: params.deadlineId,
      aiTaskId: params.aiTaskId,
    },
  })
}

export async function notifyAdmins(params: {
  type: string
  subject: string
  body: string
  priority?: string
  senderId?: string
  senderName?: string
  tags?: string[]
  metadata?: Record<string, any>
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  })

  console.log(`[notifyAdmins] Found ${admins.length} admin(s) for ${params.type}: "${params.subject}"`, {
    adminIds: admins.map((a) => a.id),
    senderId: params.senderId,
  })

  if (admins.length === 0) {
    console.warn("[notifyAdmins] No admins found in database! Bug reports and feature requests will not be delivered.")
  }

  return Promise.all(
    admins.map((admin) =>
      prisma.message.create({
        data: {
          type: params.type as any,
          priority: (params.priority || "NORMAL") as any,
          subject: params.subject,
          body: params.body,
          recipientId: admin.id,
          senderId: params.senderId,
          senderName: params.senderName,
          tags: params.tags || [],
          metadata: params.metadata || undefined,
        },
      })
    )
  )
}

export async function notifyAll(params: {
  subject: string
  body: string
  senderId: string
  senderName: string
}) {
  const users = await prisma.user.findMany({
    select: { id: true },
  })

  return Promise.all(
    users.map((user) =>
      prisma.message.create({
        data: {
          type: "SYSTEM_ANNOUNCEMENT",
          priority: "NORMAL",
          subject: params.subject,
          body: params.body,
          recipientId: user.id,
          senderId: params.senderId,
          senderName: params.senderName,
        },
      })
    )
  )
}
