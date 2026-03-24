import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { FeedPage } from "@/components/feed/feed-page"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = (session.user as any).id

  let posts: any[] = []
  let myTaskCount = 0
  let pinnedPosts: any[] = []
  let cases: any[] = []
  let users: any[] = []

  try {
    const [feedPosts, taskCount, pinned, activeCases, allUsers] = await Promise.all([
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
      prisma.task.count({
        where: {
          assigneeId: userId,
          status: "open",
        },
      }).catch(() =>
        // Fallback: count legacy feed tasks if Task table doesn't exist yet
        prisma.feedPost.count({
          where: {
            postType: "task",
            taskAssigneeId: userId,
            taskCompleted: false,
          },
        })
      ),
      prisma.feedPost.findMany({
        where: { pinned: true, archived: false },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          author: { select: { id: true, name: true, role: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        },
      }).catch(() => []),
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

    // Transform posts for client (add liked flag, flatten counts)
    posts = feedPosts.map((post) => ({
      ...post,
      replyCount: post._count.replies,
      likeCount: post._count.likes,
      reactionCount: post._count.reactions,
      liked: post.likes.length > 0,
      myReactions: post.reactions.map((r) => r.type),
      likes: undefined,
      reactions: undefined,
      _count: undefined,
    }))
    myTaskCount = taskCount
    pinnedPosts = pinned
    cases = activeCases
    users = allUsers
  } catch (error: any) {
    console.error("Dashboard feed data error:", error?.message)
    // Feed tables may not exist yet — fall back to empty feed
    // Still fetch cases and users which use existing tables
    try {
      const [activeCases, allUsers] = await Promise.all([
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
      cases = activeCases
      users = allUsers
    } catch {
      // Database completely unavailable
    }
  }

  return (
    <FeedPage
      currentUser={session.user}
      initialPosts={posts}
      myTaskCount={myTaskCount}
      pinnedPosts={pinnedPosts}
      cases={cases}
      users={users}
    />
  )
}
