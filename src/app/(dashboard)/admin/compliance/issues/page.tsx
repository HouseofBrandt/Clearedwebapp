import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { IssueTracker } from "@/components/compliance-soc2/issue-tracker"

export const metadata: Metadata = { title: "Compliance Issues | Cleared" }

export default async function ComplianceIssuesPage() {
  await requireRole(["ADMIN"])

  return <div className="page-enter"><IssueTracker /></div>
}
