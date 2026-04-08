import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { EvidenceBrowser } from "@/components/compliance-soc2/evidence-browser"

export const metadata: Metadata = { title: "Compliance Evidence | Cleared" }

export default async function ComplianceEvidencePage() {
  await requireRole(["ADMIN"])

  return <div className="page-enter"><EvidenceBrowser /></div>
}
