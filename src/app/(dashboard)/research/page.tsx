import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { ResearchHome } from "@/components/research/research-home"

export const metadata: Metadata = { title: "Research | Cleared" }

export default async function ResearchPage() {
  await requireAuth()

  return (
    <div className="page-enter">
      <ResearchHome />
    </div>
  )
}
