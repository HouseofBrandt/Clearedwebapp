export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (!["ADMIN", "SENIOR"].includes(userRole)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const url = new URL(req.url)
    const daysParam = url.searchParams.get("days")
    const days = daysParam === "all" ? null : parseInt(daysParam || "30")
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date("2000-01-01")

    const [
      tasksByType,
      reviewActions,
      recentRejections,
      recentEdits,
      kbDocuments,
      promptPerformance,
    ] = await Promise.all([
      // Tasks by type and status
      prisma.aITask.groupBy({
        by: ["taskType", "status"],
        _count: true,
        where: { createdAt: { gte: since } },
      }).catch(() => []),

      // Review actions with timing
      prisma.reviewAction.findMany({
        where: { reviewCompletedAt: { gte: since } },
        select: {
          action: true,
          reviewStartedAt: true,
          reviewCompletedAt: true,
          aiTask: { select: { taskType: true, systemPromptVersion: true } },
        },
      }).catch(() => []),

      // Recent rejection feedback
      prisma.$queryRaw`
        SELECT rf."correctionNotes", rf."taskType", rf."caseType", rf."createdAt"
        FROM "rejection_feedback" rf
        WHERE rf."createdAt" >= ${since}
        ORDER BY rf."createdAt" DESC
        LIMIT 50
      `.catch(() => []),

      // Recent edit history (by task type and case type)
      prisma.$queryRaw`
        SELECT eh."taskType", eh."caseType", eh."createdAt"
        FROM "edit_history" eh
        WHERE eh."createdAt" >= ${since}
        ORDER BY eh."createdAt" DESC
        LIMIT 100
      `.catch(() => []),

      // KB documents by category
      prisma.knowledgeDocument.groupBy({
        by: ["category"],
        _count: true,
        _avg: { freshnessScore: true },
      }).catch(() => []),

      // Prompt version performance
      prisma.aITask.groupBy({
        by: ["systemPromptVersion", "status"],
        _count: true,
        where: {
          createdAt: { gte: since },
          status: { in: ["APPROVED", "READY_FOR_REVIEW"] },
        },
      }).catch(() => []),
    ])

    // Compute approval rate by task type
    const approvalRates: Record<string, { approved: number; total: number; rate: number }> = {}
    for (const row of tasksByType as any[]) {
      if (!approvalRates[row.taskType]) {
        approvalRates[row.taskType] = { approved: 0, total: 0, rate: 0 }
      }
      approvalRates[row.taskType].total += row._count
      if (row.status === "APPROVED") {
        approvalRates[row.taskType].approved += row._count
      }
    }
    for (const key of Object.keys(approvalRates)) {
      const r = approvalRates[key]
      r.rate = r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0
    }

    // Compute review velocity (avg time per task type)
    const reviewVelocity: Record<string, { totalMs: number; count: number; avgMinutes: number }> = {}
    for (const ra of reviewActions as any[]) {
      const tt = ra.aiTask?.taskType || "unknown"
      if (!reviewVelocity[tt]) {
        reviewVelocity[tt] = { totalMs: 0, count: 0, avgMinutes: 0 }
      }
      if (ra.reviewStartedAt && ra.reviewCompletedAt) {
        reviewVelocity[tt].totalMs +=
          new Date(ra.reviewCompletedAt).getTime() - new Date(ra.reviewStartedAt).getTime()
        reviewVelocity[tt].count++
      }
    }
    for (const key of Object.keys(reviewVelocity)) {
      const v = reviewVelocity[key]
      v.avgMinutes = v.count > 0 ? Math.round(v.totalMs / v.count / 60000) : 0
    }

    // Extract rejection themes from notes
    const themes: Record<string, number> = {}
    for (const rej of recentRejections as any[]) {
      const notes = (rej.correctionNotes || "").toLowerCase()
      const keywords = [
        "rcp", "penalty", "income", "asset", "compliance",
        "missing", "incorrect", "format", "citation", "calculation",
      ]
      for (const kw of keywords) {
        if (notes.includes(kw)) {
          themes[kw] = (themes[kw] || 0) + 1
        }
      }
    }

    // Action breakdown
    const actionCounts: Record<string, number> = {}
    for (const ra of reviewActions as any[]) {
      actionCounts[ra.action] = (actionCounts[ra.action] || 0) + 1
    }

    // Edit frequency by task type + case type
    const editSections: Record<string, number> = {}
    for (const eh of recentEdits as any[]) {
      const key = `${eh.taskType || "unknown"} (${eh.caseType || "unknown"})`
      editSections[key] = (editSections[key] || 0) + 1
    }

    return NextResponse.json({
      period: { days: days || "all", since: since.toISOString() },
      approvalRates,
      actionCounts,
      reviewVelocity,
      rejectionThemes: Object.entries(themes).sort((a, b) => b[1] - a[1]),
      editSections: Object.entries(editSections).sort((a, b) => b[1] - a[1]),
      kbHealth: kbDocuments,
      promptPerformance: promptPerformance,
      totalTasks: (tasksByType as any[]).reduce((sum, r) => sum + r._count, 0),
      totalReviews: (reviewActions as any[]).length,
    })
  } catch (error) {
    console.error("Analytics API error:", error)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}
