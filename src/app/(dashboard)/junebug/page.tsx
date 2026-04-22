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
 * Feature flag: gated by `junebugThreadsEnabledForEmail(session.user.email)`.
 * During internal beta, only emails in NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS
 * reach the workspace; everyone else 404s. When the global flag is flipped
 * on, email becomes irrelevant and the gate passes for all authenticated
 * users. PR 4 removes the gate entirely.
 */

import { requireAuth } from "@/lib/auth/session"
import { JunebugWorkspace } from "@/components/junebug/junebug-workspace"
import { junebugThreadsEnabledForEmail } from "@/lib/junebug/feature-flag"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function JunebugIndexPage({
  searchParams,
}: {
  searchParams: { case?: string }
}) {
  // requireAuth() handles unauthenticated (redirects to /login); we only
  // serve 404 for authenticated-but-not-in-scope users so we don't leak
  // the workspace's existence during internal beta.
  const session = await requireAuth()
  if (!junebugThreadsEnabledForEmail(session.user.email)) notFound()

  return (
    <div className="-mx-8 -my-7 h-[calc(100vh-56px)]">
      <JunebugWorkspace scopeToCaseId={searchParams.case ?? null} />
    </div>
  )
}
