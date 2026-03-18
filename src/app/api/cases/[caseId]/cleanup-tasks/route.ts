import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tasksToDelete = await prisma.aITask.findMany({
    where: { caseId: params.caseId, status: { in: ["PROCESSING", "REJECTED"] } },
    select: { id: true },
  })
  const taskIds = tasksToDelete.map((t) => t.id)

  if (taskIds.length > 0) {
    await prisma.reviewAction.deleteMany({ where: { aiTaskId: { in: taskIds } } })
    await prisma.auditLog.deleteMany({ where: { aiTaskId: { in: taskIds } } })
    await prisma.aITask.deleteMany({ where: { id: { in: taskIds } } })
  }

  return NextResponse.json({ deleted: taskIds.length })
}
