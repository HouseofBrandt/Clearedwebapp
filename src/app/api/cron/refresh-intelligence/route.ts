import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"
import { createFeedEvent } from "@/lib/feed/create-event"

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends CRON_SECRET header)
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const activeCases = await prisma.case.findMany({
    where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
    select: { id: true },
  })

  let refreshed = 0
  let failed = 0
  for (const c of activeCases) {
    try {
      await computeCaseGraph(c.id)
      refreshed++
    } catch (err: any) {
      console.error(`[Cron] Failed to refresh case ${c.id}:`, err.message)
      failed++
    }
  }

  // Post deadline warning feed events for deadlines in the next 3 days
  try {
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

    const upcomingDeadlines = await prisma.deadline.findMany({
      where: {
        dueDate: { lte: threeDaysFromNow, gte: new Date() },
        status: { in: ["UPCOMING", "DUE_SOON"] },
      },
      include: { case: { select: { id: true, tabsNumber: true, clientName: true } } },
    })

    for (const d of upcomingDeadlines) {
      const daysRemaining = Math.ceil(
        (d.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      await createFeedEvent({
        eventType: "deadline_warning",
        caseId: d.caseId,
        eventData: { deadline: { title: d.title, dueDate: d.dueDate, daysRemaining } },
        content: `Deadline in ${daysRemaining} day(s): ${d.title}`,
      })
    }
  } catch (err: any) {
    console.error("[Cron] Deadline feed events failed:", err.message)
  }

  return NextResponse.json({ refreshed, failed, total: activeCases.length })
}
