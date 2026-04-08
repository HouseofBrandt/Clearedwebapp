import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { IntakeWizard } from "@/components/research/intake/intake-wizard"

export const metadata: Metadata = { title: "New Research | Cleared" }

export default async function NewResearchPage() {
  await requireAuth()

  return (
    <div className="page-enter">
      <IntakeWizard />
    </div>
  )
}
