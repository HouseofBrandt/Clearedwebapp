import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) {
    return auth.response
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Fetch all data in parallel
  const [aiLogs, reviewActions, tasksWithFlags] = await Promise.all([
    // AI request audit logs this month
    prisma.auditLog.findMany({
      where: { action: "AI_REQUEST", timestamp: { gte: startOfMonth } },
      select: { metadata: true },
    }),
    // Review actions this month
    prisma.reviewAction.findMany({
      where: { reviewCompletedAt: { gte: startOfMonth } },
      select: {
        action: true,
        reviewStartedAt: true,
        reviewCompletedAt: true,
        flagsAcknowledged: true,
      },
    }),
    // Tasks with flags this month
    prisma.aITask.findMany({
      where: { createdAt: { gte: startOfMonth } },
      select: {
        taskType: true,
        verifyFlagCount: true,
        judgmentFlagCount: true,
        modelUsed: true,
      },
    }),
  ])

  // API usage stats
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const modelCounts: Record<string, number> = {}

  for (const log of aiLogs) {
    const meta = log.metadata as any
    if (meta) {
      totalInputTokens += meta.inputTokens || 0
      totalOutputTokens += meta.outputTokens || 0
      if (meta.model) {
        modelCounts[meta.model] = (modelCounts[meta.model] || 0) + 1
      }
    }
  }

  // Task type breakdown
  const taskTypeCounts: Record<string, number> = {}
  let totalVerifyFlags = 0
  let totalJudgmentFlags = 0

  for (const task of tasksWithFlags) {
    taskTypeCounts[task.taskType] = (taskTypeCounts[task.taskType] || 0) + 1
    totalVerifyFlags += task.verifyFlagCount
    totalJudgmentFlags += task.judgmentFlagCount
  }

  // Review stats
  let totalReviewTime = 0
  let reviewsWithTime = 0
  let approvedCount = 0
  let editApprovedCount = 0
  let rejectedCount = 0
  let flagsAcknowledgedCount = 0
  let flagsPendingCount = 0

  for (const ra of reviewActions) {
    if (ra.reviewStartedAt && ra.reviewCompletedAt) {
      const duration = (new Date(ra.reviewCompletedAt).getTime() - new Date(ra.reviewStartedAt).getTime()) / 1000
      if (duration > 0 && duration < 86400) { // sanity check: less than 24h
        totalReviewTime += duration
        reviewsWithTime++
      }
    }
    if (ra.action === "APPROVE") approvedCount++
    else if (ra.action === "EDIT_APPROVE") editApprovedCount++
    else rejectedCount++

    if (ra.flagsAcknowledged) flagsAcknowledgedCount++
    else flagsPendingCount++
  }

  return NextResponse.json({
    month: startOfMonth.toISOString(),
    totalRequests: aiLogs.length,
    totalInputTokens,
    totalOutputTokens,
    reviewStats: {
      totalReviews: reviewActions.length,
      avgReviewTimeSeconds: reviewsWithTime > 0 ? Math.round(totalReviewTime / reviewsWithTime) : 0,
      approvedCount,
      editApprovedCount,
      rejectedCount,
    },
    flagStats: {
      totalVerifyFlags,
      totalJudgmentFlags,
      flagsAcknowledgedCount,
      flagsPendingCount,
    },
    modelBreakdown: Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count),
    taskTypeBreakdown: Object.entries(taskTypeCounts)
      .map(([taskType, count]) => ({ taskType, count }))
      .sort((a, b) => b.count - a.count),
  })
}
