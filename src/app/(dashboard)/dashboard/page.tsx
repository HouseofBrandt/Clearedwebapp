import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting"
import { DashboardSplit } from "@/components/dashboard/dashboard-split"
import { DashboardJunebugPane } from "@/components/dashboard/dashboard-junebug-pane"
import { FeedPage } from "@/components/feed/feed-page"
import { junebugThreadsEnabledForEmail } from "@/lib/junebug/feature-flag"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

/**
 * Dashboard — "Editorial Calm" shell wrapping the full feed.
 *
 * The shell is intentionally minimal — Cormorant greeting at the top, then
 * the full `FeedPage` which carries every feature the team actually uses:
 * post composer with @mention + #case autocomplete, task creation with
 * assignee + priority + due date, file share, replies, acknowledge, edit,
 * infinite scroll, filters, and pinned strip.
 *
 * Pippen's daily brief is still rendered as the editorial pull-quote card
 * because `FeedCard` routes `pippen_digest` posts (or posts whose content
 * begins with the Pippen takeaway header) to `PippenTakeawayCard`.
 *
 * ALL client names are decrypted server-side before being passed to client
 * components. Cases, users, and posts never reach the browser as ciphertext.
 */
export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = session.user.id

  let initialPosts: any[] = []
  let pinnedPosts: any[] = []
  let cases: { id: string; tabsNumber: string; clientName: string }[] = []
  let users: { id: string; name: string }[] = []
  let myTaskCount = 0

  try {
    const [postsResult, pinnedResult, casesResult, usersResult, taskCountResult] =
      await Promise.allSettled([
        prisma.feedPost.findMany({
          take: 20,
          orderBy: { createdAt: "desc" },
          where: { archived: false },
          include: {
            author: { select: { id: true, name: true, role: true } },
            case: {
              select: { id: true, tabsNumber: true, clientName: true, caseType: true },
            },
            taskAssignee: { select: { id: true, name: true } },
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                completedAt: true,
              },
            },
            replies: {
              take: 3,
              orderBy: { createdAt: "asc" },
              include: { author: { select: { id: true, name: true } } },
            },
            reactions: { where: { userId }, select: { id: true, type: true } },
            _count: { select: { replies: true, likes: true, reactions: true } },
            likes: { where: { userId }, select: { id: true } },
          },
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
          take: 80,
        }),
        prisma.user.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.feedPost.count({
          where: {
            taskAssigneeId: userId,
            taskCompleted: false,
            postType: { in: ["task", "task_created"] },
            archived: false,
          },
        }),
      ])

    /** Decrypt the embedded case.clientName on a prisma post or pinned post. */
    const decryptEmbeddedCase = (p: any) => {
      if (p.case && p.case.clientName) {
        let decrypted = p.case.clientName
        try {
          decrypted = decryptField(p.case.clientName)
        } catch {
          /* fallthrough */
        }
        p.case = { ...p.case, clientName: decrypted }
      }
      return p
    }

    if (postsResult.status === "fulfilled") {
      initialPosts = postsResult.value.map((post) => {
        const decrypted = decryptEmbeddedCase({ ...post })
        return {
          ...decrypted,
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
        }
      })
    }

    if (pinnedResult.status === "fulfilled") {
      pinnedPosts = pinnedResult.value.map((p) => {
        const decrypted = decryptEmbeddedCase({ ...p })
        return {
          ...decrypted,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }
      })
    }

    if (casesResult.status === "fulfilled") {
      cases = casesResult.value.map((c) => {
        let clientName = c.tabsNumber || "Unknown"
        try {
          clientName = decryptField(c.clientName)
        } catch {
          /* fallback to tabs */
        }
        return { id: c.id, tabsNumber: c.tabsNumber, clientName }
      })
    }

    if (usersResult.status === "fulfilled") users = usersResult.value
    if (taskCountResult.status === "fulfilled") myTaskCount = taskCountResult.value
  } catch (error: any) {
    console.error("[Dashboard] data error:", error?.message)
  }

  const currentUser = {
    id: userId,
    name: session.user.name || "there",
    role: session.user.role || "PRACTITIONER",
  }

  // Bifurcate only for users who have Junebug turned on (global flag or
  // internal beta). When off, render the pre-existing single-column
  // layout byte-for-byte so a rollback is visually invisible.
  const junebugOn = junebugThreadsEnabledForEmail(session.user.email)

  const feedNode = (
    <FeedPage
      currentUser={currentUser}
      initialPosts={initialPosts}
      myTaskCount={myTaskCount}
      pinnedPosts={pinnedPosts}
      cases={cases}
      users={users}
    />
  )

  if (!junebugOn) {
    return (
      <div className="page-enter" style={{ minHeight: 0 }}>
        <div
          className="mx-auto"
          style={{
            maxWidth: 680,
            paddingLeft: 32,
            paddingRight: 32,
            paddingTop: 48,
            paddingBottom: 120,
          }}
        >
          <DashboardGreeting userName={currentUser.name} />
          {feedNode}
        </div>
      </div>
    )
  }

  // Bifurcated layout: greeting stays narrow and centered (it's
  // editorial and benefits from the 680px measure); the split below
  // gets a wider container so each pane has room to breathe at
  // ≥1024px viewports. At md..lg the split stacks; at <md it becomes
  // a tabbed switcher (handled inside DashboardSplit).
  return (
    <div className="page-enter" style={{ minHeight: 0 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 680,
          paddingLeft: 32,
          paddingRight: 32,
          paddingTop: 48,
        }}
      >
        <DashboardGreeting userName={currentUser.name} />
      </div>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1440,
          paddingLeft: 32,
          paddingRight: 32,
          paddingBottom: 120,
        }}
      >
        <DashboardSplit
          feedSlot={feedNode}
          junebugSlot={<DashboardJunebugPane currentUser={currentUser} />}
        />
      </div>
    </div>
  )
}
