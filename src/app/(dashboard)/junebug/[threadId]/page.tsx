/**
 * /junebug/[threadId] — open a specific thread in the workspace.
 *
 * Spec §9. The page just hydrates the workspace with an initial thread
 * id; all data fetching (thread + messages) happens client-side via the
 * hooks in `src/components/junebug/hooks/`, so another user's thread id
 * still returns 404 from the API (which the hook surfaces as an error).
 *
 * We deliberately do NOT do a server-side thread-ownership check here:
 *   - the workspace's hooks already handle 404s
 *   - keeping this page thin avoids an extra prisma round-trip on every
 *     navigation
 *   - spec §6.3 requires the API to be the source of truth for ownership
 */

import { requireAuth } from "@/lib/auth/session"
import { JunebugWorkspace } from "@/components/junebug/junebug-workspace"
import { junebugVisibleForUser } from "@/lib/junebug/feature-flag"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function JunebugThreadPage({
  params,
  searchParams,
}: {
  params: { threadId: string }
  searchParams: { case?: string }
}) {
  const session = await requireAuth()
  if (!junebugVisibleForUser(session.user.email)) notFound()

  return (
    <div className="-mx-8 -my-7 h-[calc(100vh-56px)]">
      <JunebugWorkspace
        initialThreadId={params.threadId}
        scopeToCaseId={searchParams.case ?? null}
      />
    </div>
  )
}
