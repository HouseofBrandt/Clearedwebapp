import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { z } from "zod"

const reassignSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(50),
  newAssigneeId: z.string(),
})

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN", "SENIOR"])
  if (!auth.authorized) {
    return auth.response
  }

  const body = await request.json()
  const parsed = reassignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { taskIds, newAssigneeId } = parsed.data

  // Verify assignee exists
  const assignee = await prisma.user.findUnique({
    where: { id: newAssigneeId },
    select: { id: true, name: true },
  })
  if (!assignee) {
    return NextResponse.json({ error: "Assignee not found" }, { status: 404 })
  }

  // Update tasks — use createdById as the "assigned reviewer" field
  const result = await prisma.aITask.updateMany({
    where: { id: { in: taskIds }, status: "READY_FOR_REVIEW" },
    data: { createdById: newAssigneeId },
  })

  // Audit log (fire-and-forget)
  logAudit({
    userId: auth.userId,
    action: AUDIT_ACTIONS.REVIEW_REASSIGNED,
    metadata: {
      taskIds,
      newAssigneeId,
      newAssigneeName: assignee.name,
      updatedCount: result.count,
    },
  })

  return NextResponse.json({
    success: true,
    reassigned: result.count,
    assignee: assignee.name,
  })
}
