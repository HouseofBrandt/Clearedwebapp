import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ChatPanel } from "@/components/assistant/chat-panel"
import { IdleTimeout } from "@/components/layout/idle-timeout"
import { DiagnosticsInit } from "@/components/diagnostics-init"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()

  let pendingReviewCount = 0
  let overdueDeadlineCount = 0
  let unreadMessageCount = 0
  try {
    const accessFilter = await caseAccessFilter(session.user.id)
    const [reviews, overdue, unread] = await Promise.all([
      prisma.aITask.count({ where: { status: "READY_FOR_REVIEW", case: accessFilter } }),
      prisma.deadline.count({
        where: {
          dueDate: { lt: new Date() },
          status: { in: ["UPCOMING"] },
          case: accessFilter,
        },
      }),
      prisma.message.count({
        where: {
          recipientId: session.user.id,
          read: false,
          archived: false,
        },
      }).catch(() => 0),
    ])
    pendingReviewCount = reviews
    overdueDeadlineCount = overdue
    unreadMessageCount = unread
  } catch {
    // If the table doesn't exist yet or query fails, default to 0
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={session.user} pendingReviewCount={pendingReviewCount} overdueDeadlineCount={overdueDeadlineCount} unreadMessageCount={unreadMessageCount} />
        <div
          className="flex flex-1 flex-col overflow-hidden"
          style={{ background: "var(--c-snow)" }}
        >
          <Header user={session.user} pendingReviewCount={pendingReviewCount} overdueDeadlineCount={overdueDeadlineCount} unreadMessageCount={unreadMessageCount} />
          <main
            className="flex-1 overflow-y-auto"
            style={{ padding: "28px 32px 48px" }}
          >
            {children}
          </main>
        </div>
      </div>
      <ChatPanel />
      <IdleTimeout />
      <DiagnosticsInit />
    </>
  )
}
