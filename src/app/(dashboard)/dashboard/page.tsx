import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting"
import { DashboardComposer } from "@/components/dashboard/dashboard-composer"
import { JunebugBar } from "@/components/dashboard/junebug-bar"
import { DashboardFeed } from "@/components/dashboard/dashboard-feed"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

/**
 * Dashboard — "Editorial Calm" redesign.
 *
 * This page is intentionally minimal. The principles:
 *   - Greeting (welcoming, no urgency — the bell holds alerts)
 *   - Composer (the team's primary input)
 *   - Junebug bar (doorway to the AI assistant)
 *   - Pippen's daily brief (editorial pull-quote in the featured zone)
 *   - Team feed below a 0.5px divider
 *
 * Removed vs. the old dashboard:
 *   - Stat cards (zeros made the page feel empty; moved to /cases analytics)
 *   - Action items queue (lives in the notification bell now)
 *   - Right sidebar (cramped the feed; deadlines + team moved to notifications)
 *   - "X items need attention" greeting subtitle (urgency is opt-in now)
 */
export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let initialPosts: any[] = []
  let cases: { id: string; tabsNumber: string; clientName: string }[] = []

  try {
    const [postsResult, casesResult] = await Promise.allSettled([
      prisma.feedPost.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        where: { archived: false },
        include: {
          author: { select: { id: true, name: true, role: true } },
          case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
          _count: { select: { replies: true, likes: true, reactions: true } },
          likes: { where: { userId }, select: { id: true } },
        },
      }),
      prisma.case.findMany({
        where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
        select: { id: true, tabsNumber: true, clientName: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ])

    if (postsResult.status === "fulfilled") {
      initialPosts = postsResult.value.map((post) => ({
        ...post,
        replyCount: post._count.replies,
        likeCount: post._count.likes,
        reactionCount: post._count.reactions,
        liked: post.likes.length > 0,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        likes: undefined,
        _count: undefined,
      }))
    }
    if (casesResult.status === "fulfilled") cases = casesResult.value
  } catch (error: any) {
    console.error("[Dashboard] data error:", error?.message)
  }

  const currentUser = {
    id: userId,
    name: session.user.name || "there",
    role: session.user.role || "PRACTITIONER",
  }

  return (
    <div className="page-enter" style={{ minHeight: 0 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 620,
          paddingLeft: 32,
          paddingRight: 32,
          paddingTop: 48,
          paddingBottom: 120,
        }}
      >
        <DashboardGreeting userName={currentUser.name} />

        <DashboardComposer currentUser={currentUser} cases={cases} />

        <JunebugBar />

        <DashboardFeed posts={initialPosts} currentUser={currentUser} />
      </div>
    </div>
  )
}
