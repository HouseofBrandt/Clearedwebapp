import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"

const bulkUpdateSchema = z.object({
  messageIds: z.array(z.string().min(1)).min(1),
  updates: z.object({
    archived: z.boolean().optional(),
    read: z.boolean().optional(),
    implementationStatus: z.string().optional(),
  }),
})

const bulkDeleteSchema = z.object({
  messageIds: z.array(z.string().min(1)).min(1),
})

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = bulkUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { messageIds, updates } = parsed.data

    // Implementation status updates require admin role
    if (updates.implementationStatus !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { role: true },
      })
      if (user?.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only admins can update implementation status" },
          { status: 403 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}

    if (updates.read === true) {
      updateData.read = true
      updateData.readAt = new Date()
    }
    if (updates.read === false) {
      updateData.read = false
      updateData.readAt = null
    }
    if (updates.archived !== undefined) {
      updateData.archived = updates.archived
    }
    if (updates.implementationStatus !== undefined) {
      updateData.implementationStatus = updates.implementationStatus
      if (updates.implementationStatus === "implemented") {
        updateData.implementedAt = new Date()
        updateData.implementedById = auth.userId
      }
    }

    const result = await prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: updateData,
    })

    logAudit({
      userId: auth.userId,
      action: "MESSAGES_BULK_UPDATED",
      metadata: {
        messageIds,
        updates,
        updatedCount: result.count,
      },
    })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error("Bulk update messages error:", error)
    return NextResponse.json(
      { error: "Failed to bulk update messages" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { messageIds } = parsed.data

    const result = await prisma.message.deleteMany({
      where: { id: { in: messageIds } },
    })

    logAudit({
      userId: auth.userId,
      action: "MESSAGES_BULK_DELETED",
      metadata: {
        messageIds,
        deletedCount: result.count,
      },
    })

    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error("Bulk delete messages error:", error)
    return NextResponse.json(
      { error: "Failed to bulk delete messages" },
      { status: 500 }
    )
  }
}
