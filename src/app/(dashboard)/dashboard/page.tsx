import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { FeedPage } from "@/components/feed/feed-page"
import { StatCards } from "@/components/dashboard/stat-cards"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { ActionItems } from "@/components/dashboard/action-items"
import { RightSidebar } from "@/components/dashboard/right-sidebar"

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

  // Build right sidebar data
  const team = users.map((u: any) => ({ id: u.id, name: u.name, role: "Practitioner" }))

  const deadlines = (commandData?.deadlines || []).slice(0, 5).map((d: any) => ({
    id: d.id,
    title: d.title,
    caseId: d.case?.id || d.caseId,
    caseRef: d.case?.tabsNumber || "",
    dueDate: typeof d.dueDate === "string" ? d.dueDate : new Date(d.dueDate).toISOString(),
  }))

  // Compute case progress from active cases (document count as rough progress proxy)
  let caseProgress: { id: string; name: string; tabsNumber: string; percent: number }[] = []
  try {
    const progressCases = await prisma.case.findMany({
      where: { status: { in: ["ANALYSIS", "REVIEW", "ACTIVE"] } },
      select: { id: true, clientName: true, tabsNumber: true, status: true, _count: { select: { documents: true, aiTasks: true } } },
      orderBy: { updatedAt: "desc" },
      take: 3,
    })
    caseProgress = progressCases.map((c) => {
      let name = c.tabsNumber || "Unknown"
      try { name = decryptField(c.clientName) } catch {}
      // Rough progress: ANALYSIS=30%, REVIEW=60%, ACTIVE=80%, + bonus for docs/tasks
      const baseProgress = c.status === "ANALYSIS" ? 30 : c.status === "REVIEW" ? 60 : 80
      const docBonus = Math.min(c._count.documents * 5, 15)
      const taskBonus = Math.min(c._count.aiTasks * 3, 10)
      return { id: c.id, name, tabsNumber: c.tabsNumber || "", percent: Math.min(baseProgress + docBonus + taskBonus, 95) }
    })
  } catch {}

  // Build action items from command center data
  const actionItems = (commandData?.actionQueue || []).slice(0, 6).map((item: any, i: number) => ({
    id: `action-${item.caseId}-${i}`,
    ...item,
  }))

  const currentUser = { id: userId, name: session.user.name || "User", role: session.user.role || "PRACTITIONER" }

  return (
    <div className="flex page-enter" style={{ minHeight: 0 }}>
      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-4xl mx-auto">
        <DashboardHeader
          userName={session.user.name || "there"}
          actionItemCount={actionItems.length}
        />

        <StatCards
          pendingReviews={pendingReviews}
          deadlinesThisWeek={deadlinesThisWeek}
          activeCases={activeCases}
          openTasks={openTasks}
        />

        <ActionItems items={actionItems} />

        {/* Activity divider */}
        <div className="flex items-center gap-4 mb-5">
          <div className="text-overline" style={{ color: "var(--c-gray-300)" }}>Activity</div>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--c-gray-100), transparent)" }} />
        </div>

        <FeedPage
          currentUser={currentUser}
          initialPosts={initialPosts}
          myTaskCount={myTaskCount}
          pinnedPosts={pinnedPosts}
          cases={cases}
          users={users}
        />
      </div>

      {/* Right sidebar */}
      <RightSidebar
        deadlines={deadlines}
        team={team}
        pendingReviews={pendingReviews}
        activeCases={caseProgress}
      />
    </div>
  )
}
