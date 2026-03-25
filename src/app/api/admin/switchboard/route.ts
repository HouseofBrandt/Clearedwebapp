import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { getReviewInsights } from "@/lib/switchboard/review-insights"
import { getPromptBias } from "@/lib/switchboard/prompt-bias"
import { getCaseContextPacket, formatContextForPrompt } from "@/lib/switchboard/context-packet"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const url = new URL(req.url)
    const daysParam = url.searchParams.get("days")
    const caseId = url.searchParams.get("caseId")
    const days = daysParam === "all" ? null : parseInt(daysParam || "30")
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date("2000-01-01")

    // 1. Pipeline Volume — AITask counts by status
    const tasksByStatus = await prisma.aITask.groupBy({
      by: ["status"],
      _count: true,
      where: { createdAt: { gte: since } },
    }).catch(() => [])

    // 2. Pipeline timeline — tasks per day by status (raw SQL for date truncation)
    const tasksByDay = await prisma.$queryRaw`
      SELECT DATE("createdAt") as day, status, COUNT(*)::int as count
      FROM "ai_tasks"
      WHERE "createdAt" >= ${since}
      GROUP BY day, status
      ORDER BY day
    `.catch(() => [])

    // 3. Review Actions breakdown
    const reviewActions = await prisma.reviewAction.groupBy({
      by: ["action"],
      _count: true,
      where: { reviewCompletedAt: { gte: since } },
    }).catch(() => [])

    // 4. Review velocity — avg minutes per action type
    const reviewVelocityAll = await prisma.reviewAction.findMany({
      where: { reviewCompletedAt: { gte: since } },
      select: { action: true, reviewStartedAt: true, reviewCompletedAt: true },
    }).catch(() => [])
    const reviewVelocityRaw = reviewVelocityAll.filter(r => r.reviewStartedAt != null)

    const reviewVelocity: Record<string, { totalMs: number; count: number; avgMinutes: number }> = {}
    for (const ra of reviewVelocityRaw as any[]) {
      if (!reviewVelocity[ra.action]) {
        reviewVelocity[ra.action] = { totalMs: 0, count: 0, avgMinutes: 0 }
      }
      if (ra.reviewStartedAt && ra.reviewCompletedAt) {
        reviewVelocity[ra.action].totalMs +=
          new Date(ra.reviewCompletedAt).getTime() - new Date(ra.reviewStartedAt).getTime()
        reviewVelocity[ra.action].count++
      }
    }
    for (const key of Object.keys(reviewVelocity)) {
      const v = reviewVelocity[key]
      v.avgMinutes = v.count > 0 ? Math.round(v.totalMs / v.count / 60000) : 0
    }

    // 5. Rejection themes from RejectionFeedback
    const rejections = await prisma.rejectionFeedback.findMany({
      where: { createdAt: { gte: since } },
      select: { correctionNotes: true, caseType: true, taskType: true },
    }).catch(() => [])

    const themes: Record<string, number> = {}
    const THEME_KEYWORDS = [
      "rcp", "penalty", "income", "asset", "compliance",
      "missing", "incorrect", "format", "citation", "calculation",
      "csed", "statute", "expense", "filing",
    ]
    for (const rej of rejections as any[]) {
      const notes = (rej.correctionNotes || "").toLowerCase()
      for (const kw of THEME_KEYWORDS) {
        if (notes.includes(kw)) {
          themes[kw] = (themes[kw] || 0) + 1
        }
      }
    }

    // 6. Edit hotspots from EditHistory
    const edits = await prisma.editHistory.findMany({
      where: { createdAt: { gte: since } },
      select: { originalOutput: true, editedOutput: true, taskType: true, caseType: true },
    }).catch(() => [])

    const editHotspots: Record<string, { count: number; commonChange: string }> = {}
    for (const edit of edits as any[]) {
      const sections = extractEditedSections(edit.originalOutput || "", edit.editedOutput || "")
      for (const section of sections) {
        if (!editHotspots[section.name]) {
          editHotspots[section.name] = { count: 0, commonChange: section.change }
        }
        editHotspots[section.name].count++
      }
    }

    // 7. Model performance
    const modelPerf = await prisma.aITask.groupBy({
      by: ["modelUsed", "status"],
      _count: true,
      where: { createdAt: { gte: since } },
    }).catch(() => [])

    // 8. Context assembly stats from AuditLog
    const contextLogs = await prisma.auditLog.findMany({
      where: { action: "AI_CONTEXT_ASSEMBLED", timestamp: { gte: since } },
      select: { metadata: true },
      take: 100,
      orderBy: { timestamp: "desc" },
    }).catch(() => [])

    // 9. Active learned patterns — call getReviewInsights for each case type
    const caseTypes = ["OIC", "IA", "PENALTY", "CNC", "TFRP", "INNOCENT_SPOUSE", "UNFILED", "AUDIT", "CDP", "ERC"]
    const learnedPatterns: Record<string, string> = {}
    for (const ct of caseTypes) {
      try {
        const insights = await getReviewInsights(ct)
        if (insights) learnedPatterns[ct] = insights
      } catch { /* non-fatal */ }
    }

    // 10. Active prompt biases
    const taskTypes = ["WORKING_PAPERS", "CASE_MEMO", "PENALTY_LETTER", "OIC_NARRATIVE", "GENERAL_ANALYSIS"]
    const activeBiases: { caseType: string; taskType: string; bias: string }[] = []
    for (const ct of caseTypes) {
      for (const tt of taskTypes) {
        try {
          const bias = await getPromptBias(ct, tt)
          if (bias) activeBiases.push({ caseType: ct, taskType: tt, bias })
        } catch { /* non-fatal */ }
      }
    }

    // 11. Context Inspector (if caseId provided)
    let contextPacket: any = null
    let contextFormatted: string | null = null
    if (caseId) {
      try {
        const packet = await getCaseContextPacket(caseId, {
          includeKnowledge: true,
          includeReviewInsights: true,
        })
        if (packet) {
          contextPacket = packet
          contextFormatted = formatContextForPrompt(packet)
        }
      } catch { /* non-fatal */ }
    }

    // Compute summary metrics
    const totalTasks = (tasksByStatus as any[]).reduce((sum, r) => sum + r._count, 0)

    const approvedCount = (tasksByStatus as any[])
      .filter((r: any) => r.status === "APPROVED")
      .reduce((sum: number, r: any) => sum + r._count, 0)

    const approvalRate = totalTasks > 0 ? Math.round((approvedCount / totalTasks) * 100) : 0

    let avgReviewMs = 0
    let reviewCount = 0
    for (const v of Object.values(reviewVelocity)) {
      avgReviewMs += v.totalMs
      reviewCount += v.count
    }
    const avgReviewMinutes = reviewCount > 0 ? Math.round(avgReviewMs / reviewCount / 60000) : 0

    const learnedPatternCount = Object.keys(learnedPatterns).length

    return NextResponse.json({
      period: { days: days || "all", since: since.toISOString() },
      summary: {
        totalTasks,
        approvalRate,
        avgReviewMinutes,
        learnedPatternCount,
      },
      tasksByStatus,
      tasksByDay,
      reviewActions,
      reviewVelocity,
      rejectionThemes: Object.entries(themes).sort((a, b) => b[1] - a[1]),
      editHotspots: Object.entries(editHotspots)
        .map(([name, data]) => ({ name, count: data.count, commonChange: data.commonChange }))
        .sort((a, b) => b.count - a.count),
      modelPerf,
      contextLogs,
      learnedPatterns,
      activeBiases,
      contextPacket,
      contextFormatted,
    })
  } catch (error) {
    console.error("Switchboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch switchboard data" }, { status: 500 })
  }
}

/**
 * Extract which markdown sections changed between original and edited output.
 */
function extractEditedSections(
  original: string,
  edited: string
): Array<{ name: string; change: string }> {
  const results: Array<{ name: string; change: string }> = []
  const origSections = parseSections(original)
  const editSections = parseSections(edited)

  for (const [heading, origContent] of Array.from(origSections.entries())) {
    const editContent = editSections.get(heading)
    if (editContent && editContent !== origContent) {
      const lenDiff = editContent.length - origContent.length
      let change = "content was revised in place"
      if (lenDiff > 200) change = "content was expanded significantly"
      else if (lenDiff < -200) change = "content was shortened"
      results.push({ name: heading, change })
    }
  }
  return results
}

function parseSections(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = text.split("\n")
  let currentHeading = "Introduction"
  let currentContent: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.set(currentHeading, currentContent.join("\n").trim())
      }
      currentHeading = headingMatch[1].trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentContent.length > 0) {
    sections.set(currentHeading, currentContent.join("\n").trim())
  }
  return sections
}
