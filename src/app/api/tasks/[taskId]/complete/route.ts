import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

/**
 * POST /api/tasks/[taskId]/complete — mark task complete (V2)
 * Also supports PATCH for backward compatibility.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  return handleComplete(params.taskId)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  return handleComplete(params.taskId)
}

async function handleComplete(taskId: string) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Update task entity
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedById: auth.userId,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true } },
      },
    })

    // Create task_completed feed post
    const feedPost = await prisma.feedPost.create({
      data: {
        authorId: auth.userId,
        authorType: "user",
        postType: "task_completed",
        content: `Completed task: ${task.title}`,
        taskId: task.id,
        sourceType: "task",
        sourceId: task.id,
        caseId: task.caseId,
      },
    })

    // Link case if present
    if (task.caseId) {
      await prisma.feedPostCase.create({
        data: { postId: feedPost.id, caseId: task.caseId },
      }).catch(() => {})
    }

    // Also update any existing task_created feed posts (legacy compat)
    await prisma.feedPost.updateMany({
      where: { taskId: task.id, postType: { in: ["task_created", "task"] } },
      data: { taskCompleted: true, taskCompletedAt: new Date(), taskCompletedById: auth.userId },
    }).catch(() => {})

    return NextResponse.json(decryptEmbeddedCaseClientName(updated))
  } catch (error: any) {
    console.error("[Tasks] Complete error:", error.message)
    return NextResponse.json({ error: "Failed to complete task" }, { status: 500 })
  }
}
