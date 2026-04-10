import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { decryptField } from "@/lib/encryption"

/**
 * GET /api/notifications
 * ----------------------
 * Aggregates notifications for the current user from multiple sources into
 * a single grouped response. There is NO Notification model in the DB —
 * notifications are derived from existing records (deadlines, reviews,
 * messages, feed mentions, tasks, Pippen digests).
 *
 * Each notification has a valid `href` so clicking always navigates the
 * user to the exact page that resolves it. "Read" state is derived from
 * the underlying record where possible (message.read, deadline.completedDate,
 * etc.) and defaults to false otherwise.
 *
 * Response shape:
 *   {
 *     unreadCount: number,
 *     notifications: [
 *       {
 *         id: string,
 *         category: "deadlines" | "mentions" | "research" | "junebug" | "pippen",
 *         title: string,       // Bold source line
 *         body: string,        // Subtitle / context
 *         href: string,        // Where to navigate on click
 *         timestamp: string,   // ISO 8601
 *         read: boolean,
 *       }
 *     ]
 *   }
 */

interface Notification {
  id: string
  category: "deadlines" | "mentions" | "research" | "junebug" | "pippen"
  title: string
  body: string
  href: string
  timestamp: string
  read: boolean
}

const MAX_PER_CATEGORY = 10

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return ""
  try {
    return decryptField(value)
  } catch {
    return value
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const userId = auth.userId
  const now = new Date()
  const notifications: Notification[] = []

  // Case access filter — only show notifications for cases the user can see.
  let accessFilter: any = {}
  try {
    accessFilter = await caseAccessFilter(userId)
  } catch {
    accessFilter = {}
  }

  // ── 1. Deadlines — upcoming (7d) + overdue ──────────────────
  try {
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const deadlines = await prisma.deadline.findMany({
      where: {
        status: { in: ["UPCOMING", "DUE_SOON", "OVERDUE"] },
        completedDate: null,
        dueDate: { lte: inSevenDays },
        case: accessFilter,
        OR: [{ assignedToId: userId }, { assignedToId: null }],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        updatedAt: true,
        case: {
          select: { id: true, tabsNumber: true, clientName: true },
        },
      },
      orderBy: { dueDate: "asc" },
      take: MAX_PER_CATEGORY,
    })

    for (const d of deadlines) {
      const daysLeft = daysBetween(now, d.dueDate)
      const clientName = d.case ? safeDecrypt(d.case.clientName) : ""
      const caseRef = d.case ? `${clientName || d.case.tabsNumber}` : ""
      const body =
        daysLeft <= 0
          ? `Overdue · ${caseRef}`
          : daysLeft === 1
          ? `Due tomorrow · ${caseRef}`
          : `Due in ${daysLeft} days · ${caseRef}`

      notifications.push({
        id: `deadline-${d.id}`,
        category: "deadlines",
        title: d.title,
        body: body.trim(),
        href: d.case ? `/cases/${d.case.id}` : "/calendar",
        timestamp: d.updatedAt.toISOString(),
        read: false, // Deadlines stay unread until completed
      })
    }
  } catch (err: any) {
    console.warn("[notifications] deadlines query failed:", err?.message)
  }

  // ── 2. Tasks assigned to me ─────────────────────────────────
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: "open",
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        case: {
          select: { id: true, tabsNumber: true, clientName: true },
        },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: MAX_PER_CATEGORY,
    })

    for (const t of tasks) {
      const clientName = t.case ? safeDecrypt(t.case.clientName) : ""
      const caseRef = t.case ? ` · ${clientName || t.case.tabsNumber}` : ""
      const assignedBy = t.createdBy?.name ? `Assigned by ${t.createdBy.name}` : "New task"
      notifications.push({
        id: `task-${t.id}`,
        category: "deadlines",
        title: t.title,
        body: `${assignedBy}${caseRef}`,
        href: "/tasks",
        timestamp: t.updatedAt.toISOString(),
        read: false,
      })
    }
  } catch (err: any) {
    console.warn("[notifications] tasks query failed:", err?.message)
  }

  // ── 3. Pending AI reviews (Research) ────────────────────────
  try {
    const reviews = await prisma.aITask.findMany({
      where: {
        status: "READY_FOR_REVIEW",
        case: accessFilter,
      },
      select: {
        id: true,
        taskType: true,
        updatedAt: true,
        case: {
          select: { id: true, tabsNumber: true, clientName: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_CATEGORY,
    })

    for (const r of reviews) {
      const clientName = r.case ? safeDecrypt(r.case.clientName) : ""
      const caseRef = r.case ? `${clientName || r.case.tabsNumber}` : ""
      const typeLabel = r.taskType
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())

      notifications.push({
        id: `review-${r.id}`,
        category: "research",
        title: `${typeLabel} ready for review`,
        body: caseRef || "Open the review queue",
        href: `/review/${r.id}`,
        timestamp: r.updatedAt.toISOString(),
        read: false,
      })
    }
  } catch (err: any) {
    console.warn("[notifications] reviews query failed:", err?.message)
  }

  // ── 4. Unread inbox messages (Mentions) ─────────────────────
  try {
    const messages = await prisma.message.findMany({
      where: {
        recipientId: userId,
        archived: false,
        read: false,
      },
      select: {
        id: true,
        subject: true,
        body: true,
        createdAt: true,
        sender: { select: { name: true } },
        senderName: true,
        case: {
          select: { id: true, tabsNumber: true, clientName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PER_CATEGORY,
    })

    for (const m of messages) {
      const senderName = m.sender?.name || m.senderName || "Someone"
      const clientName = m.case ? safeDecrypt(m.case.clientName) : ""
      const caseRef = m.case ? ` · ${clientName || m.case.tabsNumber}` : ""
      const snippet = m.body.slice(0, 80).replace(/\s+/g, " ").trim()

      notifications.push({
        id: `message-${m.id}`,
        category: "mentions",
        title: `${senderName}: ${m.subject}`,
        body: `${snippet}${snippet.length >= 80 ? "…" : ""}${caseRef}`,
        href: "/inbox",
        timestamp: m.createdAt.toISOString(),
        read: false,
      })
    }
  } catch (err: any) {
    console.warn("[notifications] messages query failed:", err?.message)
  }

  // ── 5. Feed mentions (Mentions) ─────────────────────────────
  try {
    const feedMentions = await prisma.feedMention.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true,
        display: true,
        post: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
            case: {
              select: { id: true, tabsNumber: true, clientName: true },
            },
          },
        },
      },
      orderBy: { id: "desc" },
      take: MAX_PER_CATEGORY,
    })

    for (const fm of feedMentions) {
      if (!fm.post) continue
      const authorName = fm.post.author?.name || "Someone"
      const clientName = fm.post.case ? safeDecrypt(fm.post.case.clientName) : ""
      const caseRef = fm.post.case ? ` · ${clientName || fm.post.case.tabsNumber}` : ""
      const snippet = (fm.post.content || "")
        .slice(0, 100)
        .replace(/\s+/g, " ")
        .trim()

      notifications.push({
        id: `mention-${fm.id}`,
        category: "mentions",
        title: `${authorName} mentioned you`,
        body: `${snippet}${snippet.length >= 100 ? "…" : ""}${caseRef}`,
        href: fm.post.case ? `/cases/${fm.post.case.id}` : "/dashboard",
        timestamp: fm.post.createdAt.toISOString(),
        read: false,
      })
    }
  } catch (err: any) {
    console.warn("[notifications] feed mentions query failed:", err?.message)
  }

  // ── 6. Pippen — most recent daily brief (today only) ────────
  try {
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const pippenPost = await prisma.feedPost.findFirst({
      where: {
        OR: [
          { postType: "pippen_digest" },
          { content: { contains: "Pippen's Daily Takeaway" } },
        ],
        archived: false,
        createdAt: { gte: startOfDay },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })

    if (pippenPost) {
      notifications.push({
        id: `pippen-${pippenPost.id}`,
        category: "pippen",
        title: "Today's daily brief is ready",
        body: "Pippen scanned the Federal Register and IRS sources overnight",
        href: "/pippen",
        timestamp: pippenPost.createdAt.toISOString(),
        read: false,
      })
    }
  } catch (err: any) {
    console.warn("[notifications] pippen query failed:", err?.message)
  }

  // Sort within the response by timestamp desc — the grouping happens
  // client-side so the user can still see cross-category recency.
  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const unreadCount = notifications.filter((n) => !n.read).length

  return NextResponse.json({
    unreadCount,
    notifications,
  })
}
