import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

const createTaskSchema = z.object({
  taskTitle: z.string().min(1).max(500),
  content: z.string().max(10000).optional(),
  caseId: z.string().optional(),
  taskAssigneeId: z.string(),
  taskDueDate: z.string().optional(), // ISO date string
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
})

/**
 * POST /api/feed/task — create a task + corresponding feed post (V2)
 * Creates a Task record in the tasks table AND a feed post linking to it.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { taskTitle, content, caseId, taskAssigneeId, taskDueDate, priority } = parsed.data

    // Create the Task record first
    let task: any = null
    try {
      task = await prisma.task.create({
        data: {
          title: taskTitle,
          description: content || null,
          createdById: auth.userId,
          assigneeId: taskAssigneeId,
          dueDate: taskDueDate ? new Date(taskDueDate) : null,
          priority: priority || "normal",
          caseId: caseId || null,
        },
      })
    } catch {
      // Task table may not exist yet — continue with legacy-only approach
    }

    // Create the feed post (linked to task if created)
    const post = await prisma.feedPost.create({
      data: {
        authorId: auth.userId,
        authorType: "user",
        postType: task ? "task_created" : "task",
        content: content || null,
        caseId: caseId || null,
        sourceType: task ? "task" : null,
        sourceId: task?.id || null,
        taskId: task?.id || null,
        taskTitle,
        taskAssigneeId,
        taskDueDate: taskDueDate ? new Date(taskDueDate) : null,
        mentions: caseId
          ? [{ type: "case", id: caseId, display: "" }]
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        taskAssignee: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true } },
      },
    })

    // Create normalized case link
    if (caseId) {
      try {
        await prisma.feedPostCase.create({
          data: { postId: post.id, caseId },
        })
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json(decryptEmbeddedCaseClientName(post), { status: 201 })
  } catch (error: any) {
    console.error("[Feed] Create task failed:", error.message)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }
}
