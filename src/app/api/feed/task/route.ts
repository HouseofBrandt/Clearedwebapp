import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const createTaskSchema = z.object({
  taskTitle: z.string().min(1).max(500),
  content: z.string().max(10000).optional(),
  caseId: z.string().optional(),
  taskAssigneeId: z.string(),
  taskDueDate: z.string().optional(), // ISO date string
})

/**
 * POST /api/feed/task — create a task post
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

    const { taskTitle, content, caseId, taskAssigneeId, taskDueDate } = parsed.data

    const post = await prisma.feedPost.create({
      data: {
        authorId: auth.userId,
        authorType: "user",
        postType: "task",
        content: content || null,
        caseId: caseId || null,
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
      },
    })

    return NextResponse.json(post, { status: 201 })
  } catch (error: any) {
    console.error("[Feed] Create task failed:", error.message)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }
}
