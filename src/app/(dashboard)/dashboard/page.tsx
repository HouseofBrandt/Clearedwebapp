import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { DailyBrief } from "@/components/dashboard/command-center"
import { FeedPage } from "@/components/feed/feed-page"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let pendingReviews = 0
  let deadlinesThisWeek = 0
  let activeCases = 0
  let openTasks = 0
  let commandData: any = null

  // Feed data
  let initialPosts: any[] = []
  let myTaskCount = 0
  let pinnedPosts: any[] = []
  let cases: { id: string; tabsNumber: string; clientName: string }[] = []
  let users: { id: string; name: string }[] = []

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

  // Fetch feed data
  try {
    const [postsResult, taskCountResult, pinnedResult, casesResult, usersResult] = await Promise.allSettled([
      prisma.feedPost.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        where: { archived: false },
        include: {
          author: { select: { id: true, name: true, role: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
          taskAssignee: { select: { id: true, name: true } },
          task: { select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true } },
          replies: {
            take: 3,
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true } } },
          },
          reactions: {
            where: { userId },
            select: { id: true, type: true },
          },
          _count: { select: { replies: true, likes: true, reactions: true } },
          likes: {
            where: { userId },
            select: { id: true },
          },
        },
      }),
      prisma.feedPost.count({
        where: { taskAssigneeId: userId, taskCompleted: false, postType: { in: ["task", "task_created"] }, archived: false },
      }),
      prisma.feedPost.findMany({
        where: { pinned: true, archived: false },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          case: { select: { id: true, tabsNumber: true, clientName: true } },
        },
      }),
      prisma.case.findMany({
        where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
        select: { id: true, tabsNumber: true, clientName: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.user.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ])

    if (postsResult.status === "fulfilled") {
      initialPosts = postsResult.value.map((post) => ({
        ...post,
        replyCount: post._count.replies,
        likeCount: post._count.likes,
        reactionCount: post._count.reactions,
        liked: post.likes.length > 0,
        myReactions: post.reactions.map((r) => r.type),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        likes: undefined,
        reactions: undefined,
        _count: undefined,
      }))
    }
    if (taskCountResult.status === "fulfilled") myTaskCount = taskCountResult.value
    if (pinnedResult.status === "fulfilled") pinnedPosts = pinnedResult.value.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))
    if (casesResult.status === "fulfilled") cases = casesResult.value
    if (usersResult.status === "fulfilled") users = usersResult.value
  } catch (error: any) {
    console.error("Feed data error:", error?.message)
  }

  const currentUser = {
    id: userId,
    name: session.user.name || "User",
    role: session.user.role || "PRACTITIONER",
  }

  // Determine if command center has urgent items
  const hasUrgentItems = commandData && (
    commandData.actionQueue.length > 0 ||
    commandData.deadlines.length > 0 ||
    commandData.pendingReviews > 0
  )

  return (
    <div className="max-w-5xl mx-auto">
      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 bg-white hover:border-[var(--c-gray-200)] transition-all duration-150" style={{ boxShadow: 'var(--shadow-1)' }}>
          <div className="text-overline" style={{ color: 'var(--c-danger)' }}>Awaiting Review</div>
          <div className="stat-number mt-1.5" style={{ color: pendingReviews > 0 ? 'var(--c-danger)' : 'var(--c-gray-700)' }}>{pendingReviews}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 bg-white hover:border-[var(--c-gray-200)] transition-all duration-150" style={{ boxShadow: 'var(--shadow-1)' }}>
          <div className="text-overline" style={{ color: 'var(--c-warning)' }}>Deadlines This Week</div>
          <div className="stat-number mt-1.5" style={{ color: deadlinesThisWeek > 0 ? 'var(--c-warning)' : 'var(--c-gray-700)' }}>{deadlinesThisWeek}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 bg-white hover:border-[var(--c-gray-200)] transition-all duration-150" style={{ boxShadow: 'var(--shadow-1)' }}>
          <div className="text-overline">Active Cases</div>
          <div className="stat-number mt-1.5">{activeCases}</div>
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 bg-white hover:border-[var(--c-gray-200)] transition-all duration-150" style={{ boxShadow: 'var(--shadow-1)' }}>
          <div className="text-overline">Open Tasks</div>
          <div className="stat-number mt-1.5">{openTasks}</div>
        </div>
      </div>

      {/* Daily Brief / Command Center */}
      {commandData ? (
        hasUrgentItems ? (
          <DailyBrief data={commandData} userName={session.user.name || "there"} />
        ) : (
          <div className="rounded-xl border border-[var(--c-gray-100)] bg-white px-5 py-4 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-1)' }}>
            <span className="text-[var(--c-success)] text-lg">&#10003;</span>
            <span className="text-[13px]" style={{ color: 'var(--c-gray-500)' }}>
              All clear &mdash; no items need attention right now.
            </span>
          </div>
        )
      ) : (
        <div className="text-center py-16" style={{ color: 'var(--c-gray-300)' }}>
          <p className="text-sm">Unable to load dashboard data. Please try refreshing.</p>
        </div>
      )}

      {/* Section Separator */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="text-overline">ACTIVITY</div>
        <div className="flex-1 h-px bg-[var(--c-gray-100)]" />
      </div>

      {/* Feed */}
      <FeedPage
        currentUser={currentUser}
        initialPosts={initialPosts}
        myTaskCount={myTaskCount}
        pinnedPosts={pinnedPosts}
        cases={cases}
        users={users}
      />
    </div>
  )
}
