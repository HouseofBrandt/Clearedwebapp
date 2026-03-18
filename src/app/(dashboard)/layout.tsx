import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()

  let pendingReviewCount = 0
  try {
    pendingReviewCount = await prisma.aITask.count({
      where: { status: "READY_FOR_REVIEW" },
    })
  } catch {
    // If the table doesn't exist yet or query fails, default to 0
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={session.user} pendingReviewCount={pendingReviewCount} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={session.user} pendingReviewCount={pendingReviewCount} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
