import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { canAccessCase } from "@/lib/auth/case-access"

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
      case: { select: { tabsNumber: true, clientName: true, caseType: true } },
      reviewActions: {
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewStartedAt: "desc" },
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  // Verify the user can access the case this task belongs to
  const userId = (session.user as any).id
  if (!await canAccessCase(userId, task.caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Decrypt detokenizedOutput and clientName before returning to client
  const decryptedTask = {
    ...task,
    detokenizedOutput: task.detokenizedOutput ? decryptField(task.detokenizedOutput) : null,
    case: task.case ? { ...task.case, clientName: decryptField(task.case.clientName) } : task.case,
  }

  return NextResponse.json(decryptedTask)
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

  // Verify the user can access the case this task belongs to
  const userId = (session.user as any).id
  if (!await canAccessCase(userId, task.caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (task.status === "APPROVED") {
    return NextResponse.json({ error: "Cannot delete approved tasks." }, { status: 400 })
  }

  // Delete related records in a transaction to prevent orphaned records
  await prisma.$transaction([
    prisma.reviewAction.deleteMany({ where: { aiTaskId: params.taskId } }),
    prisma.auditLog.deleteMany({ where: { aiTaskId: params.taskId } }),
    prisma.aITask.delete({ where: { id: params.taskId } }),
  ])

  return NextResponse.json({ message: "Task deleted" })
}
