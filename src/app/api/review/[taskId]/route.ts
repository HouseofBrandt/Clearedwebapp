import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logReviewAction } from "@/lib/ai/audit"
import { notify } from "@/lib/notifications"
import { z } from "zod"

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "EDIT_APPROVE", "REJECT_REPROMPT", "REJECT_MANUAL"]),
  editedOutput: z.string().optional(),
  reviewNotes: z.string().optional(),
  reviewStartedAt: z.string().optional(),
  flagsAcknowledged: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Forbidden: only licensed practitioners can review AI output" },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { action, editedOutput, reviewNotes, reviewStartedAt, flagsAcknowledged } = parsed.data

    const task = await prisma.aITask.findUnique({
      where: { id: params.taskId },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (task.status !== "READY_FOR_REVIEW") {
      return NextResponse.json(
        { error: "Task is not in reviewable state" },
        { status: 400 }
      )
    }

    // Use client-provided reviewStartedAt for accurate review duration tracking.
    // Falls back to server time if not provided.
    const startedAt = reviewStartedAt
      ? new Date(reviewStartedAt)
      : new Date()

    // Create review action
    const reviewAction = await prisma.reviewAction.create({
      data: {
        aiTaskId: params.taskId,
        practitionerId: auth.userId,
        action: action as any,
        editedOutput: editedOutput || null,
        reviewNotes: reviewNotes || null,
        reviewStartedAt: startedAt,
        reviewCompletedAt: new Date(),
        flagsAcknowledged: flagsAcknowledged ?? false,
      },
    })

    // Update task status
    const newStatus = action === "REJECT_REPROMPT" || action === "REJECT_MANUAL"
      ? "REJECTED"
      : "APPROVED"

    await prisma.aITask.update({
      where: { id: params.taskId },
      data: {
        status: newStatus,
        ...(action === "EDIT_APPROVE" && editedOutput
          ? { detokenizedOutput: editedOutput }
          : {}),
      },
    })

    // Audit log
    await logReviewAction({
      aiTaskId: params.taskId,
      practitionerId: auth.userId,
      caseId: task.caseId,
      action,
      reviewNotes,
    })

    // Fire-and-forget notification to the task creator
    if (task.createdById && task.createdById !== auth.userId) {
      const taskLabel = task.taskType.replace(/_/g, " ")
      const caseInfo = await prisma.case.findUnique({
        where: { id: task.caseId },
        select: { caseNumber: true },
      })
      const caseNumber = caseInfo?.caseNumber || task.caseId

      if (newStatus === "APPROVED") {
        notify({
          recipientId: task.createdById,
          type: "TASK_APPROVED",
          subject: `${taskLabel} approved`,
          body: `Your ${taskLabel} for ${caseNumber} has been approved and is now a deliverable.`,
          caseId: task.caseId,
          aiTaskId: task.id,
        }).catch(() => {})
      } else {
        notify({
          recipientId: task.createdById,
          type: "TASK_REJECTED",
          subject: `${taskLabel} rejected`,
          body: `Your ${taskLabel} for ${caseNumber} was rejected.${reviewNotes ? ` Notes: ${reviewNotes}` : ""}`,
          caseId: task.caseId,
          aiTaskId: task.id,
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      reviewAction,
      taskStatus: newStatus,
    })
  } catch (error) {
    console.error("Review error:", error)
    return NextResponse.json({ error: "Review action failed" }, { status: 500 })
  }
}
