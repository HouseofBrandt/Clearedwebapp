import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { ReportsView } from "@/components/compliance-soc2/reports-view"

export const metadata: Metadata = { title: "Compliance Reports | Cleared" }

export default async function ComplianceReportsPage() {
  await requireRole(["ADMIN"])

  return <div className="page-enter"><ReportsView /></div>
}
