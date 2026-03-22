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

  // Serialize dates for client component
  const serialized = deadlines.map((d) => ({
    ...d,
    dueDate: d.dueDate.toISOString(),
    reminderDate: d.reminderDate?.toISOString() || null,
    completedDate: d.completedDate?.toISOString() || null,
    irsNoticeDate: d.irsNoticeDate?.toISOString() || null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }))

  return (
    <CalendarClient
      deadlines={serialized}
      users={users}
      cases={cases}
      currentUserId={userId}
    />
  )
}
