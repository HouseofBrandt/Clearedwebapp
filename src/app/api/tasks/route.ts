import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import {
  decryptEmbeddedCaseClientName,
  decryptEmbeddedCaseClientNames,
} from "@/lib/feed/decrypt-case-name"

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  caseId: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
})

/**
 * GET /api/tasks — list tasks with filters
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const assigneeId = searchParams.get("assigneeId")
  const caseId = searchParams.get("caseId")
  const status = searchParams.get("status")

  const where: any = {}
  if (assigneeId) where.assigneeId = assigneeId
  if (caseId) where.caseId = caseId
  if (status) where.status = status
  else where.status = { in: ["open", "in_progress"] }

  try {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true } },
      },
    })
    return NextResponse.json({ tasks: decryptEmbeddedCaseClientNames(tasks) })
  } catch (error: any) {
    console.error("[Tasks] List error:", error?.message)
    return NextResponse.json({ tasks: [] })
  }
}

/**
 * POST /api/tasks — create a task + feed post projection
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

    const { title, description, assigneeId, dueDate, caseId, priority } = parsed.data

    // Create the task entity
    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        createdById: auth.userId,
        assigneeId: assigneeId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        caseId: caseId || null,
        priority: priority || "normal",
      },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true } },
      },
    })

    // Create feed post projection
    const feedPost = await prisma.feedPost.create({
      data: {
        authorId: auth.userId,
        authorType: "user",
        postType: "task_created",
        content: description || null,
        taskId: task.id,
        sourceType: "task",
        sourceId: task.id,
        // Legacy compat
        taskTitle: title,
        taskAssigneeId: assigneeId || null,
        taskDueDate: dueDate ? new Date(dueDate) : null,
        caseId: caseId || null,
      },
    })

    // Create FeedPostCase link if case is tagged
    if (caseId) {
      await prisma.feedPostCase.create({
        data: { postId: feedPost.id, caseId },
      }).catch(() => {})
    }

    return NextResponse.json(decryptEmbeddedCaseClientName(task), { status: 201 })
  } catch (error: any) {
    console.error("[Tasks] Create error:", error.message)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }
}
