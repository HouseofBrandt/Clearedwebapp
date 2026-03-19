import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { CaseDetail } from "@/components/cases/case-detail"

const caseInclude = {
  assignedPractitioner: { select: { id: true, name: true, email: true } },
  documents: {
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { uploadedAt: "desc" as const },
  },
  aiTasks: {
    include: {
      reviewActions: {
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewStartedAt: "desc" as const },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
}

export default async function CaseDetailPage({
  params,
}: {
  params: { caseId: string }
}) {
  await requireAuth()

  let caseData = await prisma.case.findUnique({
    where: { id: params.caseId },
    include: caseInclude,
  })

  if (!caseData) {
    notFound()
  }

  // Auto-expire PROCESSING tasks older than 10 minutes
  const zombieIds = caseData.aiTasks
    .filter((t) => t.status === "PROCESSING" && Date.now() - new Date(t.createdAt).getTime() > 10 * 60 * 1000)
    .map((t) => t.id)
  if (zombieIds.length > 0) {
    await prisma.aITask.updateMany({
      where: { id: { in: zombieIds } },
      data: { status: "REJECTED" },
    })
    caseData = await prisma.case.findUnique({
      where: { id: params.caseId },
      include: caseInclude,
    })
    if (!caseData) notFound()
  }

  const [practitioners, deadlines] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.deadline.findMany({
      where: { caseId: params.caseId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
  ])

  // Serialize dates for client component
  const serializedDeadlines = deadlines.map((d) => ({
    ...d,
    dueDate: d.dueDate.toISOString(),
    reminderDate: d.reminderDate?.toISOString() || null,
    completedDate: d.completedDate?.toISOString() || null,
    irsNoticeDate: d.irsNoticeDate?.toISOString() || null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }))

  return <CaseDetail caseData={caseData} practitioners={practitioners} deadlines={serializedDeadlines} />
}
