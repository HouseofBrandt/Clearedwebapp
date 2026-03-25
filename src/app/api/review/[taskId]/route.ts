import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { encryptField, decryptField } from "@/lib/encryption"
import { logReviewAction } from "@/lib/ai/audit"
import { notify } from "@/lib/notifications"
import { autoIngestToKnowledgeBase } from "@/lib/banjo/auto-ingest"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"
import { createFeedEvent } from "@/lib/feed/create-event"
import { z } from "zod"

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "EDIT_APPROVE", "REJECT_REPROMPT", "REJECT_MANUAL"]),
  editedOutput: z.string().optional(),
  reviewNotes: z.string().optional(),
  reviewStartedAt: z.union([z.string(), z.number()]).optional(),
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
      include: { case: { select: { caseType: true } } },
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

    // P1-B: Require flags acknowledged before approval
    if ((action === "APPROVE" || action === "EDIT_APPROVE") &&
        (task.verifyFlagCount > 0 || task.judgmentFlagCount > 0) &&
        !flagsAcknowledged) {
      return NextResponse.json(
        { error: "You must acknowledge all [VERIFY] and [PRACTITIONER JUDGMENT] flags before approving." },
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
          ? { detokenizedOutput: encryptField(editedOutput) }
          : {}),
      },
    })

    // Learning loop: track edits and rejections (fire-and-forget)
    if (action === "EDIT_APPROVE" && editedOutput && task.detokenizedOutput) {
      const decryptedOriginal = decryptField(task.detokenizedOutput)
      prisma.editHistory.create({
        data: {
          aiTaskId: task.id,
          caseType: task.case.caseType,
          taskType: task.taskType,
          originalOutput: decryptedOriginal,
          editedOutput,
          practitionerId: auth.userId,
        },
      }).catch(() => {})
    }
    if ((action === "REJECT_REPROMPT" || action === "REJECT_MANUAL") && reviewNotes) {
      prisma.rejectionFeedback.create({
        data: {
          aiTaskId: task.id,
          caseType: task.case.caseType,
          taskType: task.taskType,
          correctionNotes: reviewNotes,
          practitionerId: auth.userId,
        },
      }).catch(() => {})
    }

    // Auto-ingest to Knowledge Base on approval (fire-and-forget)
    // Re-fetch after update so EDIT_APPROVE gets the edited output, not the pre-edit draft
    if (newStatus === "APPROVED") {
      const finalTask = await prisma.aITask.findUnique({
        where: { id: params.taskId },
        select: { id: true, taskType: true, caseId: true, detokenizedOutput: true, createdById: true },
      })
      if (finalTask) {
        // Decrypt before passing to KB ingest
        const decryptedTask = {
          ...finalTask,
          detokenizedOutput: finalTask.detokenizedOutput ? decryptField(finalTask.detokenizedOutput) : null,
        }
        autoIngestToKnowledgeBase(decryptedTask, auth.userId).catch((err) => {
          console.error("[Review] Auto-KB-ingest failed (non-blocking):", err.message)
        })
      }
    }

    // Refresh case graph after review (fire-and-forget)
    computeCaseGraph(task.caseId).catch(() => {})

    // Audit log (fire-and-forget — don't block review on audit logging)
    logReviewAction({
      aiTaskId: params.taskId,
      practitionerId: auth.userId,
      caseId: task.caseId,
      action,
      reviewNotes: reviewNotes || undefined,
    }).catch((err) => {
      console.error("[Review] Audit log failed (non-blocking):", err.message)
    })

    // Feed event (fire-and-forget)
    createFeedEvent({
      eventType: newStatus === "APPROVED" ? "review_approved" : "review_rejected",
      caseId: task.caseId,
      eventData: { taskType: task.taskType, taskLabel: task.banjoStepLabel },
      content: `${newStatus === "APPROVED" ? "Approved" : "Rejected"} ${task.banjoStepLabel || task.taskType.replace(/_/g, " ")}`,
    }).catch(() => {})

    // Log activity (fire-and-forget)
    const taskLabel = task.taskType.replace(/_/g, " ")
    prisma.caseActivity.create({
      data: {
        caseId: task.caseId,
        userId: auth.userId,
        action: "REVIEW_COMPLETED",
        description: `${action === "APPROVE" || action === "EDIT_APPROVE" ? "Approved" : "Rejected"} ${taskLabel}`,
        metadata: { taskId: task.id, action: action },
      },
    }).catch(() => {})

    // Fire-and-forget notification to the task creator
    try {
      if (task.createdById && task.createdById !== auth.userId) {
        const caseInfo = await prisma.case.findUnique({
          where: { id: task.caseId },
          select: { tabsNumber: true },
        })
        const tabsNumber = caseInfo?.tabsNumber || task.caseId

        notify({
          recipientId: task.createdById,
          type: newStatus === "APPROVED" ? "TASK_APPROVED" : "TASK_REJECTED",
          subject: `${taskLabel} ${newStatus === "APPROVED" ? "approved" : "rejected"}`,
          body: newStatus === "APPROVED"
            ? `Your ${taskLabel} for ${tabsNumber} has been approved.`
            : `Your ${taskLabel} for ${tabsNumber} was rejected.${reviewNotes ? ` Notes: ${reviewNotes}` : ""}`,
          caseId: task.caseId,
          aiTaskId: task.id,
        }).catch(() => {})
      }
    } catch (notifyErr: any) {
      console.error("[Review] Notification failed (non-blocking):", notifyErr.message)
    }

    return NextResponse.json({
      reviewAction,
      taskStatus: newStatus,
    })
  } catch (error: any) {
    console.error("[Review] Action failed:", error.message)
    console.error("[Review] Stack:", error.stack)
    console.error("[Review] Task:", params.taskId)
    return NextResponse.json(
      { error: "Review action failed", detail: error.message },
      { status: 500 }
    )
  }
}
