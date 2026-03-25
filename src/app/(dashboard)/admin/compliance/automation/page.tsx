import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { AutomationDashboard } from "@/components/compliance-soc2/automation-dashboard"

export const metadata: Metadata = { title: "Compliance Automation | Cleared" }

export default async function ComplianceAutomationPage() {
  await requireRole(["ADMIN"])

  return <AutomationDashboard />
}
