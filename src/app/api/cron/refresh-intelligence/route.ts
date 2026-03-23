import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"

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

  return NextResponse.json({ refreshed, failed, total: activeCases.length })
}
