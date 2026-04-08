import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { notFound } from "next/navigation"
import { SessionDetail } from "@/components/research/session/session-detail"

export const metadata: Metadata = { title: "Research Session | Cleared" }

export default async function ResearchSessionPage({
  params,
}: {
  params: { sessionId: string }
}) {
  await requireAuth()

  if (!params.sessionId) {
    notFound()
  }

  return (
    <div className="page-enter">
      <SessionDetail sessionId={params.sessionId} />
    </div>
  )
}
