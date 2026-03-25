import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptCasePII } from "@/lib/encryption"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { notFound } from "next/navigation"
import { canAccessCase } from "@/lib/auth/case-access"
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

  const hasAccess = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccess) {
    notFound()
  }

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

  const userId = (session.user as any).id

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

  // Feed posts — separate query so a missing table doesn't break the page
  let caseFeedPosts: any[] = []
  try {
    caseFeedPosts = await prisma.feedPost.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      where: { caseId: params.caseId, archived: false },
      include: {
        author: { select: { id: true, name: true, role: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        taskAssignee: { select: { id: true, name: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
        _count: { select: { replies: true, likes: true } },
        likes: {
          where: { userId },
          select: { id: true },
        },
      },
    })
  } catch (err: any) {
    console.error("Case feed posts error (non-blocking):", err?.message)
  }

  // Note and conversation counts
  const [noteCount, conversationCount] = await Promise.all([
    prisma.clientNote.count({ where: { caseId: params.caseId, isDeleted: false } }).catch(() => 0),
    prisma.conversation.count({ where: { caseId: params.caseId, status: { in: ["OPEN", "RESOLVED"] } } }).catch(() => 0),
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

  // Transform feed posts for client
  const serializedFeedPosts = caseFeedPosts.map((post) => ({
    ...post,
    replyCount: post._count.replies,
    likeCount: post._count.likes,
    liked: post.likes.length > 0,
    likes: undefined,
    _count: undefined,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }))

  return (
    <CaseDetail
      caseData={{ ...decryptCasePII(caseData), noteCount, conversationCount }}
      practitioners={practitioners}
      deadlines={serializedDeadlines}
      intelligence={serializedIntelligence}
      activities={serializedActivities}
      feedPosts={serializedFeedPosts}
      currentUser={session.user}
    />
  )
}
