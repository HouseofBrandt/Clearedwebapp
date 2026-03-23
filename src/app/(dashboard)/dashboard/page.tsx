import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { getCommandCenterData } from "@/lib/dashboard/command-center"
import { CommandCenter } from "@/components/dashboard/command-center"

export const metadata: Metadata = { title: "Command Center | Cleared" }

export default async function DashboardPage() {
  const session = await requireAuth()
  const userId = (session.user as any).id

  let data
  try {
    data = await getCommandCenterData(userId)
  } catch (error: any) {
    console.error("Command center data error:", error?.message)
    // Fallback to empty state
    data = {
      actionQueue: [],
      riskRankedCases: [],
      deadlines: [],
      pendingReviews: 0,
      stats: { totalActive: 0, resolvedThisMonth: 0, staleCount: 0, avgRiskScore: 0 },
      recentActivity: [],
    }
  }

  return <CommandCenter data={data} userName={session.user.name || "Practitioner"} />
}
