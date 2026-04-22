/**
 * /junebug — the Junebug Threads workspace (spec §9).
 *
 * Splash layout — no active thread. The user can start a new conversation
 * from the composer, or pick an existing thread from the sidebar.
 *
 * Query params:
 *   - case=<caseId>   Scope the workspace to a specific case. The sidebar
 *                     defaults to "This case only" and the new-thread
 *                     button creates a case-scoped thread.
 */

import { requireAuth } from "@/lib/auth/session"
import { JunebugWorkspace } from "@/components/junebug/junebug-workspace"

export const dynamic = "force-dynamic"

export default async function JunebugIndexPage({
  searchParams,
}: {
  searchParams: { case?: string }
}) {
  await requireAuth()

  return (
    <div className="-mx-8 -my-7 h-[calc(100vh-56px)]">
      <JunebugWorkspace scopeToCaseId={searchParams.case ?? null} />
    </div>
  )
}
