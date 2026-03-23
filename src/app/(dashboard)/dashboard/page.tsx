import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { DailyBrief } from "@/components/dashboard/command-center"

export const metadata: Metadata = { title: "Dashboard | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = (session.user as any).id

  let data
  try {
    data = await getCommandCenterData(userId)
  } catch (error: any) {
    console.error("Dashboard data error:", error?.message)
    data = {
      actionQueue: [],
      riskRankedCases: [],
      deadlines: [],
      pendingReviews: 0,
      briefing: "Unable to load dashboard data. Try refreshing.",
      stats: { totalActive: 0, resolvedThisMonth: 0, staleCount: 0, avgRiskScore: 0 },
      recentActivity: [],
    }
  }

  return <DailyBrief data={data} userName={session.user.name || "Practitioner"} />
}
