import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { TaskCenterClient } from "@/components/tasks/task-center-client"

export const metadata: Metadata = { title: "Tasks | Cleared" }

/**
 * Task Center — every task the current user is on the hook for.
 *
 * Data comes from the `Task` model (the authoritative record) plus any
 * FeedPost with postType="task" that has taskAssigneeId === current user
 * (legacy records before the Task model was introduced). We dedupe by
 * joining on taskId where possible.
 *
 * Tabs:
 *   - Open (default) — status "open" or "in_progress", not completed
 *   - Completed     — status "completed"
 *   - Created by me — tasks this user assigned to OTHERS
 *
 * Each task supports: mark complete, open in context (case), reply thread
 * (from the linked feed post), and edit.
 */
export default async function TasksPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let openTasks: any[] = []
  let completedTasks: any[] = []
  let createdByMeTasks: any[] = []

  try {
    const [open, completed, created] = await Promise.allSettled([
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: ["open", "in_progress"] },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        include: {
          assignee: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true } },
          feedPosts: {
            select: { id: true, _count: { select: { replies: true } } },
            take: 1,
          },
        },
        take: 100,
      }),
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: "completed",
        },
        orderBy: { completedAt: "desc" },
        include: {
          assignee: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true } },
        },
        take: 50,
      }),
      prisma.task.findMany({
        where: {
          createdById: userId,
          assigneeId: { not: userId },
          status: { in: ["open", "in_progress"] },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        include: {
          assignee: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true } },
        },
        take: 50,
      }),
    ])

    const decryptCase = (t: any) => {
      if (t.case?.clientName) {
        try {
          t.case.clientName = decryptField(t.case.clientName)
        } catch {
          /* keep fallback */
        }
      }
      return {
        ...t,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      }
    }

    if (open.status === "fulfilled") openTasks = open.value.map(decryptCase)
    if (completed.status === "fulfilled") completedTasks = completed.value.map(decryptCase)
    if (created.status === "fulfilled") createdByMeTasks = created.value.map(decryptCase)
  } catch (error: any) {
    console.error("[Tasks] page data error:", error?.message)
  }

  return (
    <div className="page-enter" style={{ minHeight: 0 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 720,
          paddingLeft: 32,
          paddingRight: 32,
          paddingTop: 48,
          paddingBottom: 120,
        }}
      >
        <div className="mb-10">
          <h1
            style={{
              fontFamily: "var(--font-editorial)",
              fontWeight: 300,
              fontSize: 32,
              color: "var(--c-gray-800)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            Your tasks
          </h1>
          <p
            style={{
              fontFamily: "var(--font-dm)",
              fontSize: 12,
              fontWeight: 400,
              textTransform: "uppercase",
              letterSpacing: "0.166em",
              color: "var(--c-gray-400)",
              marginTop: 10,
            }}
          >
            {openTasks.length > 0
              ? `${openTasks.length} open${completedTasks.length > 0 ? ` · ${completedTasks.length} completed` : ""}`
              : "You're all caught up"}
          </p>
        </div>

        <TaskCenterClient
          openTasks={openTasks}
          completedTasks={completedTasks}
          createdByMeTasks={createdByMeTasks}
          currentUserId={userId}
        />
      </div>
    </div>
  )
}
