import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { DailyBrief } from "@/components/dashboard/command-center"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let pendingReviews = 0
  let deadlinesThisWeek = 0
  let activeCases = 0
  let openTasks = 0
  let commandData: any = null

  try {
    // Fetch command center data (includes briefing, action queue, deadlines, etc.)
    commandData = await getCommandCenterData(userId)
    pendingReviews = commandData.pendingReviews ?? 0
    activeCases = commandData.stats?.totalActive ?? 0

    // Count deadlines this week
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    deadlinesThisWeek = (commandData.deadlines || []).filter((d: any) => {
      const due = new Date(d.dueDate)
      return due >= now && due <= endOfWeek
    }).length

    // Count open tasks
    openTasks = await prisma.task.count({
      where: { assigneeId: userId, status: "open" },
    }).catch(() => 0)
  } catch (error: any) {
    console.error("Dashboard data error:", error?.message)
    // Fallback: try to get basic counts
    try {
      const [caseCount, taskCount] = await Promise.all([
        prisma.case.count({
          where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
        }),
        prisma.task.count({
          where: { assigneeId: userId, status: "open" },
        }).catch(() => 0),
      ])
      activeCases = caseCount
      openTasks = taskCount
    } catch {
      // Database completely unavailable
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5" style={{ background: 'var(--c-danger-soft)' }}>
          <div className="text-overline" style={{ color: 'var(--c-danger)' }}>AWAITING REVIEW</div>
          <div className="stat-number mt-1" style={{ color: 'var(--c-danger)' }}>{pendingReviews}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5" style={{ background: 'var(--c-warning-soft)' }}>
          <div className="text-overline" style={{ color: 'var(--c-warning)' }}>DEADLINES THIS WEEK</div>
          <div className="stat-number mt-1" style={{ color: 'var(--c-warning)' }}>{deadlinesThisWeek}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] bg-[var(--c-gray-50)] p-5">
          <div className="text-overline">ACTIVE CASES</div>
          <div className="stat-number mt-1">{activeCases}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] bg-[var(--c-gray-50)] p-5">
          <div className="text-overline">OPEN TASKS</div>
          <div className="stat-number mt-1">{openTasks}</div>
        </div>
      </div>

      {/* Daily Brief / Command Center */}
      {commandData ? (
        <DailyBrief data={commandData} userName={session.user.name || "there"} />
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Unable to load dashboard data. Please try refreshing.</p>
        </div>
      )}
    </div>
  )
}
