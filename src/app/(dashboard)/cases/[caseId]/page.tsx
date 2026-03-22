import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptCasePII } from "@/lib/encryption"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
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
  const session = await requireAuth()

  // Recalculate doc completeness on page load (ensures accuracy for pre-triage uploads)
  await recalculateDocCompleteness(params.caseId).catch(() => {})

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

  // Fire-and-forget: audit log for case view
  logAudit({
    userId: (session.user as any).id,
    action: AUDIT_ACTIONS.CASE_VIEWED,
    caseId: params.caseId,
    metadata: { tabsNumber: caseData.tabsNumber },
  })

  const [practitioners, deadlines, intelligence, activities] = await Promise.all([
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
    prisma.caseIntelligence.findUnique({
      where: { caseId: params.caseId },
    }),
    prisma.caseActivity.findMany({
      where: { caseId: params.caseId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
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

  // Serialize intelligence dates
  const serializedIntelligence = intelligence ? {
    ...intelligence,
    irsLastActionDate: intelligence.irsLastActionDate?.toISOString() || null,
    poaExpirationDate: intelligence.poaExpirationDate?.toISOString() || null,
    csedEarliest: intelligence.csedEarliest?.toISOString() || null,
    csedLatest: intelligence.csedLatest?.toISOString() || null,
    lastAssessmentDate: intelligence.lastAssessmentDate?.toISOString() || null,
    lastActivityDate: intelligence.lastActivityDate?.toISOString() || null,
    createdAt: intelligence.createdAt.toISOString(),
    updatedAt: intelligence.updatedAt.toISOString(),
  } : null

  const serializedActivities = activities.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }))

  return (
    <CaseDetail
      caseData={decryptCasePII(caseData)}
      practitioners={practitioners}
      deadlines={serializedDeadlines}
      intelligence={serializedIntelligence}
      activities={serializedActivities}
    />
  )
}
