import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { OverviewDashboard } from "@/components/compliance-soc2/overview-dashboard"

export const metadata: Metadata = { title: "SOC 2 Compliance | Cleared" }

export default async function CompliancePage() {
  await requireRole(["ADMIN"])

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">SOC 2 Compliance</h1>
        <p className="text-sm text-muted-foreground">SOC 2 Type II compliance tracker and health monitoring</p>
      </div>
      <OverviewDashboard />
    </div>
  )
}
