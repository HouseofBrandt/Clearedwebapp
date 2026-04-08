import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { DailyBrief } from "@/components/dashboard/command-center"
import { FeedPage } from "@/components/feed/feed-page"
import { StatCards } from "@/components/dashboard/stat-cards"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let pendingReviews = 0
  let deadlinesThisWeek = 0
  let activeCases = 0
  let openTasks = 0
  let commandData: any = null

  let initialPosts: any[] = []
  let myTaskCount = 0
  let pinnedPosts: any[] = []
  let cases: { id: string; tabsNumber: string; clientName: string }[] = []
  let users: { id: string; name: string }[] = []

  try {
    commandData = await getCommandCenterData(userId)
    pendingReviews = commandData.pendingReviews ?? 0
    activeCases = commandData.stats?.totalActive ?? 0

    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    deadlinesThisWeek = (commandData.deadlines || []).filter((d: any) => {
      const due = new Date(d.dueDate)
      return due >= now && due <= endOfWeek
    }).length

    openTasks = await prisma.task.count({
      where: { assigneeId: userId, status: "open" },
    }).catch(() => 0)
  } catch (error: any) {
    console.error("Dashboard data error:", error?.message)
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
    } catch {}
  }

  try {
    const [postsResult, taskCountResult, pinnedResult, casesResult, usersResult] = await Promise.allSettled([
      prisma.feedPost.findMany({
        take: 20, orderBy: { createdAt: "desc" }, where: { archived: false },
        include: {
          author: { select: { id: true, name: true, role: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
          taskAssignee: { select: { id: true, name: true } },
          task: { select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true } },
          replies: { take: 3, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
          reactions: { where: { userId }, select: { id: true, type: true } },
          _count: { select: { replies: true, likes: true, reactions: true } },
          likes: { where: { userId }, select: { id: true } },
        },
      }),
      prisma.feedPost.count({ where: { taskAssigneeId: userId, taskCompleted: false, postType: { in: ["task", "task_created"] }, archived: false } }),
      prisma.feedPost.findMany({ where: { pinned: true, archived: false }, take: 5, orderBy: { createdAt: "desc" }, include: { case: { select: { id: true, tabsNumber: true, clientName: true } } } }),
      prisma.case.findMany({ where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } }, select: { id: true, tabsNumber: true, clientName: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ])

    if (postsResult.status === "fulfilled") {
      initialPosts = postsResult.value.map((post) => ({
        ...post, replyCount: post._count.replies, likeCount: post._count.likes, reactionCount: post._count.reactions,
        liked: post.likes.length > 0, myReactions: post.reactions.map((r) => r.type),
        createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString(), likes: undefined, reactions: undefined, _count: undefined,
      }))
    }
    if (taskCountResult.status === "fulfilled") myTaskCount = taskCountResult.value
    if (pinnedResult.status === "fulfilled") pinnedPosts = pinnedResult.value.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))
    if (casesResult.status === "fulfilled") cases = casesResult.value
    if (usersResult.status === "fulfilled") users = usersResult.value
  } catch (error: any) {
    console.error("Feed data error:", error?.message)
  }

  const currentUser = { id: userId, name: session.user.name || "User", role: session.user.role || "PRACTITIONER" }
  const hasUrgentItems = commandData && (commandData.actionQueue.length > 0 || commandData.deadlines.length > 0 || commandData.pendingReviews > 0)

  return (
    <div className="max-w-5xl mx-auto page-enter">
      <StatCards pendingReviews={pendingReviews} deadlinesThisWeek={deadlinesThisWeek} activeCases={activeCases} openTasks={openTasks} />

      {commandData ? (
        hasUrgentItems ? (
          <DailyBrief data={commandData} userName={session.user.name || "there"} />
        ) : (
          <div className="rounded-[14px] px-6 py-5 flex items-center gap-3.5" style={{ background: "var(--c-success-soft)", border: "1px solid rgba(11,138,94,0.1)", boxShadow: "var(--shadow-xs)" }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ background: "rgba(11,138,94,0.08)", border: "1px solid rgba(11,138,94,0.1)" }}>
              <span style={{ color: "var(--c-success)", fontSize: "16px" }}>&#10003;</span>
            </div>
            <span className="text-[13.5px]" style={{ color: "var(--c-gray-600)" }}>All clear &mdash; no items need attention right now.</span>
          </div>
        )
      ) : (
        <div className="text-center py-16" style={{ color: 'var(--c-gray-300)' }}><p className="text-sm">Unable to load dashboard data. Please try refreshing.</p></div>
      )}

      <div className="flex items-center gap-4 mt-10 mb-5">
        <div className="text-overline" style={{ color: "var(--c-gray-300)" }}>Activity</div>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--c-gray-100), transparent)" }} />
      </div>

      <FeedPage currentUser={currentUser} initialPosts={initialPosts} myTaskCount={myTaskCount} pinnedPosts={pinnedPosts} cases={cases} users={users} />
    </div>
  )
}
