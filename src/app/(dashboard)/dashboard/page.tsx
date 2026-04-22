import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting"
import { DashboardSplit } from "@/components/dashboard/dashboard-split"
import { DashboardJunebugPane } from "@/components/dashboard/dashboard-junebug-pane"
import { FeedPage } from "@/components/feed/feed-page"

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

  // Compute at-a-glance figures for the greeting block (polish §6.1).
  // Each figure is optional — zero-count items are omitted in the component.
  // These queries are independent and failure on any one returns 0.
  let deadlinesThisWeek = 0
  let itemsInReview = 0
  let newCases = 0
  try {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const [dRes, rRes, cRes] = await Promise.allSettled([
      prisma.deadline.count({
        where: {
          dueDate: { gte: now, lte: weekFromNow },
          status: { notIn: ["COMPLETED", "WAIVED"] },
        },
      }),
      prisma.aITask.count({
        where: { status: "READY_FOR_REVIEW" },
      }),
      prisma.case.count({
        where: {
          status: "INTAKE",
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ])
    if (dRes.status === "fulfilled") deadlinesThisWeek = dRes.value
    if (rRes.status === "fulfilled") itemsInReview = rRes.value
    if (cRes.status === "fulfilled") newCases = cRes.value
  } catch (error: any) {
    console.warn("[Dashboard] glance error:", error?.message)
  }

  const currentUser = {
    id: userId,
    name: session.user.name || "there",
    role: session.user.role || "PRACTITIONER",
  }

  // Bifurcated layout (polish §6): greeting is now left-aligned and shares
  // the wider container with the split below — asymmetry with purpose.
  // At md..lg the split stacks; at <md it becomes a tabbed switcher
  // (handled inside DashboardSplit).
  return (
    <div className="polish-page-enter" style={{ minHeight: 0 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1440,
          paddingLeft: 32,
          paddingRight: 32,
          paddingTop: 48,
          paddingBottom: 120,
        }}
      >
        <DashboardGreeting
          userName={currentUser.name}
          glance={{
            deadlinesThisWeek,
            itemsInReview,
            newCases,
          }}
        />
        <DashboardSplit
          feedSlot={
            <FeedPage
              currentUser={currentUser}
              initialPosts={initialPosts}
              myTaskCount={myTaskCount}
              pinnedPosts={pinnedPosts}
              cases={cases}
              users={users}
            />
          }
          junebugSlot={<DashboardJunebugPane currentUser={currentUser} />}
        />
      </div>
    </div>
  )
}
