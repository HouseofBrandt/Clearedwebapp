import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Calendar | Cleared" }
import { prisma } from "@/lib/db"
import { CalendarClient } from "@/components/calendar/calendar-client"

export default async function CalendarPage() {
  const session = await requireAuth()
  const userId = (session.user as any).id

  const [deadlines, users, cases] = await Promise.all([
    prisma.deadline.findMany({
      include: {
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        assignedTo: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.case.findMany({
      select: { id: true, tabsNumber: true, clientName: true },
      where: { status: { notIn: ["CLOSED"] } },
      orderBy: { tabsNumber: "asc" },
    }),
  ])

  const now = new Date()

  // Serialize dates for client component and add urgency fields
  const serialized = deadlines.map((d) => ({
    ...d,
    dueDate: d.dueDate.toISOString(),
    reminderDate: d.reminderDate?.toISOString() || null,
    completedDate: d.completedDate?.toISOString() || null,
    irsNoticeDate: d.irsNoticeDate?.toISOString() || null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    urgency: d.status === "COMPLETED" ? "completed" as const :
             d.dueDate < now ? "overdue" as const :
             d.dueDate < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) ? "urgent" as const :
             d.dueDate < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) ? "soon" as const : "normal" as const,
    daysUntil: Math.ceil((d.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  }))

  // Compute summary stats (exclude completed deadlines)
  const activeDeadlines = serialized.filter((d) => d.status !== "COMPLETED")
  const overdueCount = activeDeadlines.filter((d) => d.urgency === "overdue").length
  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const thisWeekCount = activeDeadlines.filter((d) => {
    const due = new Date(d.dueDate)
    return due >= now && due <= endOfWeek
  }).length
  const endOfMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const thisMonthCount = activeDeadlines.filter((d) => {
    const due = new Date(d.dueDate)
    return due >= now && due <= endOfMonth
  }).length
  const totalCount = activeDeadlines.length

  return (
    <CalendarClient
      deadlines={serialized}
      users={users}
      cases={cases}
      currentUserId={userId}
      summaryStats={{ overdueCount, thisWeekCount, thisMonthCount, totalCount }}
    />
  )
}
