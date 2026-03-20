import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ChatPanel } from "@/components/assistant/chat-panel"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()

  let pendingReviewCount = 0
  let overdueDeadlineCount = 0
  try {
    const [reviews, overdue] = await Promise.all([
      prisma.aITask.count({ where: { status: "READY_FOR_REVIEW" } }),
      prisma.deadline.count({
        where: {
          dueDate: { lt: new Date() },
          status: { in: ["UPCOMING"] },
        },
      }),
    ])
    pendingReviewCount = reviews
    overdueDeadlineCount = overdue
  } catch {
    // If the table doesn't exist yet or query fails, default to 0
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={session.user} pendingReviewCount={pendingReviewCount} overdueDeadlineCount={overdueDeadlineCount} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={session.user} pendingReviewCount={pendingReviewCount} overdueDeadlineCount={overdueDeadlineCount} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <ChatPanel />
    </>
  )
}
