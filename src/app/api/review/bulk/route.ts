import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { z } from "zod"

const bulkActionSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(50),
  action: z.enum(["APPROVE", "REJECT_MANUAL"]),
  reviewNotes: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN", "SENIOR"])
  if (!auth.authorized) {
    return auth.response
  }

  const body = await request.json()
  const parsed = bulkActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { taskIds, action, reviewNotes } = parsed.data
  const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED"

  // Before bulk approve, verify all tasks have flags acknowledged
  if (action === "APPROVE") {
    const tasksWithFlags = await prisma.aITask.findMany({
      where: {
        id: { in: taskIds },
        OR: [{ verifyFlagCount: { gt: 0 } }, { judgmentFlagCount: { gt: 0 } }],
      },
      select: { id: true, verifyFlagCount: true, judgmentFlagCount: true },
    })

    if (tasksWithFlags.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot bulk approve tasks with unacknowledged VERIFY or JUDGMENT flags. Review each task individually.",
          tasksWithFlags: tasksWithFlags.map((t) => t.id),
        },
        { status: 422 }
      )
    }
  }

  // Verify all tasks exist and are in READY_FOR_REVIEW status
  const tasks = await prisma.aITask.findMany({
    where: { id: { in: taskIds }, status: "READY_FOR_REVIEW" },
    select: { id: true, caseId: true },
  })

  if (tasks.length === 0) {
    return NextResponse.json({ error: "No eligible tasks found" }, { status: 404 })
  }

  // Perform bulk update + create review actions in a transaction
  const results = await prisma.$transaction(async (tx) => {
    // Update all task statuses
    await tx.aITask.updateMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      data: { status: newStatus as any },
    })

    // Create review actions for each task
    const reviewActions = tasks.map((task) => ({
      aiTaskId: task.id,
      practitionerId: auth.userId,
      action: action as any,
      reviewNotes:
        reviewNotes ||
        `Bulk ${action.toLowerCase()} by ${auth.name || "admin"}`,
      reviewStartedAt: new Date(),
      reviewCompletedAt: new Date(),
    }))

    await tx.reviewAction.createMany({ data: reviewActions })

    return tasks.length
  })

  // Audit log (fire-and-forget)
  logAudit({
    userId: auth.userId,
    action:
      action === "APPROVE"
        ? AUDIT_ACTIONS.REVIEW_APPROVED
        : AUDIT_ACTIONS.REVIEW_REJECTED,
    metadata: {
      type: "bulk_action",
      taskCount: results,
      taskIds: tasks.map((t) => t.id),
    },
  })

  return NextResponse.json({ success: true, processed: results, action })
}
