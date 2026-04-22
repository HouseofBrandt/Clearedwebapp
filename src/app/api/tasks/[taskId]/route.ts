import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
})

/**
 * PATCH /api/tasks/[taskId] — update a task
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = updateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const existing = await prisma.task.findUnique({ where: { id: params.taskId } })
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const data: any = {}
    if (parsed.data.title !== undefined) data.title = parsed.data.title
    if (parsed.data.description !== undefined) data.description = parsed.data.description
    if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId
    if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status
      // When marking complete, stamp completedAt + completedById so the
      // task center can sort completed tasks chronologically and show who
      // finished them.
      if (parsed.data.status === "completed" && existing.status !== "completed") {
        data.completedAt = new Date()
        data.completedById = auth.userId
      }
      // Reopening a completed task clears the completion metadata.
      if (parsed.data.status !== "completed" && existing.status === "completed") {
        data.completedAt = null
        data.completedById = null
      }
    }

    const task = await prisma.task.update({
      where: { id: params.taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true } },
      },
    })

    return NextResponse.json(decryptEmbeddedCaseClientName(task))
  } catch (error: any) {
    console.error("[Tasks] Update error:", error.message)
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 })
  }
}
