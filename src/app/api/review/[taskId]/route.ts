import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { logReviewAction } from "@/lib/ai/audit"

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, editedOutput, reviewNotes, reviewStartedAt, flagsAcknowledged } = body

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 })
    }

    const validActions = ["APPROVE", "EDIT_APPROVE", "REJECT_REPROMPT", "REJECT_MANUAL"]
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

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
        practitionerId: (session.user as any).id,
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
      practitionerId: (session.user as any).id,
      caseId: task.caseId,
      action,
      reviewNotes,
    })

    return NextResponse.json({
      reviewAction,
      taskStatus: newStatus,
    })
  } catch (error) {
    console.error("Review error:", error)
    return NextResponse.json({ error: "Review action failed" }, { status: 500 })
  }
}
