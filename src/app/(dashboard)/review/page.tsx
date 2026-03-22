import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Review Queue | Cleared" }
import { prisma } from "@/lib/db"
import { ReviewQueue } from "@/components/review/review-queue"

export default async function ReviewPage() {
  await requireAuth()

  const pendingTasks = await prisma.aITask.findMany({
    where: { status: "READY_FOR_REVIEW" },
    select: {
      id: true,
      taskType: true,
      createdAt: true,
      verifyFlagCount: true,
      judgmentFlagCount: true,
      case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  // Serialize dates for client component
  const serializedTasks = pendingTasks.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">
          {serializedTasks.length === 0
            ? "No AI-generated outputs awaiting review"
            : `${serializedTasks.length} AI-generated output${serializedTasks.length === 1 ? "" : "s"} awaiting practitioner review`}
        </p>
      </div>

      <ReviewQueue tasks={serializedTasks} />
    </div>
  )
}
