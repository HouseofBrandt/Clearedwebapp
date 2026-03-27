import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFeedbackSummary } from "@/lib/dev/feedback-sync"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [summary, recentObservations, recentBugs, recentFeatures, reviewInsights] =
    await Promise.all([
      getFeedbackSummary(),

      // Recent observations (last 20)
      prisma.junebugObservation
        .findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            type: true,
            severity: true,
            title: true,
            description: true,
            route: true,
            syncedToTasks: true,
            createdAt: true,
          },
        })
        .catch(() => []),

      // Recent bug reports (last 10)
      prisma.message
        .findMany({
          where: { type: "BUG_REPORT" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            subject: true,
            body: true,
            implementationStatus: true,
            createdAt: true,
            metadata: true,
          },
        })
        .catch(() => []),

      // Recent feature requests (last 10)
      prisma.message
        .findMany({
          where: { type: "FEATURE_REQUEST" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            subject: true,
            body: true,
            implementationStatus: true,
            createdAt: true,
          },
        })
        .catch(() => []),

      // Review insights per case type
      prisma.rejectionFeedback
        .groupBy({
          by: ["caseType"],
          _count: true,
          orderBy: { _count: { caseType: "desc" } },
        })
        .catch(() => []),
    ])

  // Pipeline health check
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [recentObsCount, recentSyncCount] = await Promise.all([
    prisma.junebugObservation.count({ where: { createdAt: { gte: oneHourAgo } } }).catch(() => 0),
    prisma.junebugObservation
      .count({ where: { syncedToTasks: true, syncedAt: { gte: oneDayAgo } } })
      .catch(() => 0),
  ])

  const hasGithubToken = !!(process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN)
  const hasSyncSecret = !!process.env.FEEDBACK_SYNC_SECRET

  return NextResponse.json({
    summary,
    pipelineHealth: {
      observerActive: recentObsCount > 0,
      observationsLastHour: recentObsCount,
      syncedLast24h: recentSyncCount,
      githubTokenConfigured: hasGithubToken,
      syncSecretConfigured: hasSyncSecret,
    },
    recentObservations,
    recentBugs,
    recentFeatures,
    reviewInsights,
  })
}
