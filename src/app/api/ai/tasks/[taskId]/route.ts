import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const task = await prisma.aITask.findUnique({
    where: { id: params.taskId },
    include: {
      case: { select: { caseNumber: true, clientName: true, caseType: true } },
      reviewActions: {
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewStartedAt: "desc" },
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  return NextResponse.json(task)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const task = await prisma.aITask.findUnique({ where: { id: params.taskId } })
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (task.status === "APPROVED") {
    return NextResponse.json({ error: "Cannot delete approved tasks." }, { status: 400 })
  }

  // Delete related records first (FK constraints)
  await prisma.reviewAction.deleteMany({ where: { aiTaskId: params.taskId } })
  await prisma.auditLog.deleteMany({ where: { aiTaskId: params.taskId } })
  await prisma.aITask.delete({ where: { id: params.taskId } })

  return NextResponse.json({ message: "Task deleted" })
}
