import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Review Queue | Cleared" }
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { ReviewQueue } from "@/components/review/review-queue"
import { decryptField } from "@/lib/encryption"

export default async function ReviewPage() {
  const session = await requireAuth()
  const accessFilter = await caseAccessFilter((session.user as any).id)

  const [pendingTasks, allPractitioners] = await Promise.all([
    prisma.aITask.findMany({
      where: { status: "READY_FOR_REVIEW", case: accessFilter },
      select: {
        id: true,
        taskType: true,
        createdAt: true,
        createdById: true,
        verifyFlagCount: true,
        judgmentFlagCount: true,
        banjoAssignmentId: true,
        banjoStepNumber: true,
        banjoStepLabel: true,
        case: {
          select: {
            id: true,
            tabsNumber: true,
            clientName: true,
            caseType: true,
            assignedPractitionerId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["PRACTITIONER", "SENIOR", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Serialize dates and decrypt client names for client component
  const serializedTasks = pendingTasks.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    case: {
      ...t.case,
      clientName: decryptField(t.case.clientName),
    },
  }))

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Review Queue</h1>
        <p className="text-c-gray-500">
          {serializedTasks.length === 0
            ? "No AI-generated outputs awaiting review"
            : `${serializedTasks.length} AI-generated output${serializedTasks.length === 1 ? "" : "s"} awaiting practitioner review`}
        </p>
      </div>

      <ReviewQueue
        tasks={serializedTasks}
        userRole={(session.user as any).role}
        currentUserId={(session.user as any).id}
        practitioners={allPractitioners}
      />
    </div>
  )
}
