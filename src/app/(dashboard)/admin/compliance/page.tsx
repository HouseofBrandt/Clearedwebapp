import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { OverviewDashboard } from "@/components/compliance-soc2/overview-dashboard"

export const metadata: Metadata = { title: "SOC 2 Compliance | Cleared" }

export default async function CompliancePage() {
  await requireRole(["ADMIN"])

  return <OverviewDashboard />
}
