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
 *
 * Feature flag: when NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED is false, this
 * page renders a "not enabled" stub (the workspace itself gates on the
 * flag). Full deletion of /junebug routes is a follow-up if we ever
 * roll this back.
 */

import { requireAuth } from "@/lib/auth/session"
import { JunebugWorkspace } from "@/components/junebug/junebug-workspace"
import { junebugThreadsEnabled } from "@/lib/junebug/feature-flag"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function JunebugIndexPage({
  searchParams,
}: {
  searchParams: { case?: string }
}) {
  // When the flag is off the workspace would also render a stub, but
  // serving 404 here keeps the route surface clean for crawlers and
  // unauthenticated probes.
  if (!junebugThreadsEnabled()) notFound()

  await requireAuth()

  return (
    <div className="-mx-8 -my-7 h-[calc(100vh-56px)]">
      <JunebugWorkspace scopeToCaseId={searchParams.case ?? null} />
    </div>
  )
}
