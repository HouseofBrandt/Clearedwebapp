import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: params.messageId },
    })

    if (!message || message.recipientId !== auth.userId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    const body = await request.json()
    const updateData: any = {}

    if (body.read === true) {
      updateData.read = true
      updateData.readAt = new Date()
    }
    if (body.archived === true) {
      updateData.archived = true
    }
    if (body.archived === false) {
      updateData.archived = false
    }

    const updated = await prisma.message.update({
      where: { id: params.messageId },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update message error:", error)
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: params.messageId },
    })

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    })

    // Admins can hard delete; others archive
    if (user?.role === "ADMIN") {
      await prisma.message.delete({ where: { id: params.messageId } })
    } else if (message.recipientId === auth.userId) {
      await prisma.message.update({
        where: { id: params.messageId },
        data: { archived: true },
      })
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete message error:", error)
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 })
  }
}
