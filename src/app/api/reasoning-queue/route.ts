/**
 * Reasoning Queue API — List & Stats
 *
 * GET /api/reasoning-queue          — list pending human reviews
 * GET /api/reasoning-queue?stats=1  — dashboard metrics
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== "ADMIN" && role !== "SENIOR") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const wantStats = searchParams.get("stats") === "1"

  if (wantStats) {
    // Dashboard metrics
    const [total, pending, passCount, reviseCount, humanCount, avgScore] = await Promise.all([
      prisma.reasoningPipelineLog.count(),
      prisma.reasoningPipelineLog.count({
        where: { decision: "human_review", humanReviewAction: null },
      }),
      prisma.reasoningPipelineLog.count({ where: { decision: "pass" } }),
      prisma.reasoningPipelineLog.count({
        where: { decision: "pass", revisionAttempted: true },
      }),
      prisma.reasoningPipelineLog.count({ where: { decision: "human_review" } }),
      prisma.reasoningPipelineLog.aggregate({ _avg: { overallScore: true } }),
    ])

    const passRate = total > 0 ? Math.round(((passCount) / total) * 100) : 0
    const revisionRate = total > 0 ? Math.round((reviseCount / total) * 100) : 0

    // Common failure criteria
    const recentFailures = await prisma.reasoningPipelineLog.findMany({
      where: { decision: "human_review" },
      select: { firstEvaluation: true, taskType: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    const failureCriteria: Record<string, number> = {}
    for (const log of recentFailures) {
      const eval_ = log.firstEvaluation as any
      if (eval_?.criteria) {
        for (const [key, val] of Object.entries(eval_.criteria)) {
          if (val && typeof val === "object" && "pass" in val && !(val as any).pass) {
            failureCriteria[key] = (failureCriteria[key] || 0) + 1
          }
        }
      }
    }

    return NextResponse.json({
      total,
      pending,
      passRate,
      revisionRate,
      humanReviewCount: humanCount,
      avgScore: Math.round(avgScore._avg.overallScore || 0),
      commonFailures: Object.entries(failureCriteria)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([criterion, count]) => ({ criterion, count })),
    })
  }

  // List pending reviews
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = parseInt(searchParams.get("limit") || "20", 10)
  const status = searchParams.get("status") || "pending" // pending | all | resolved

  const where = status === "pending"
    ? { decision: "human_review", humanReviewAction: null }
    : status === "resolved"
      ? { decision: "human_review", humanReviewAction: { not: null } }
      : {}

  const [items, count] = await Promise.all([
    prisma.reasoningPipelineLog.findMany({
      where,
      select: {
        id: true,
        caseId: true,
        taskType: true,
        decision: true,
        overallScore: true,
        revisionAttempted: true,
        deliveredToUser: true,
        totalLatencyMs: true,
        humanReviewAction: true,
        createdAt: true,
        originalRequest: true,
        case: { select: { tabsNumber: true, clientName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reasoningPipelineLog.count({ where }),
  ])

  return NextResponse.json({
    items,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  })
}
