import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

/**
 * If the Vercel function that was running this session's launch dies
 * mid-flight (maxDuration hit, container evicted, instance restarted),
 * the session's status stays at RETRIEVING/COMPOSING/EVALUATING forever
 * because nothing else updates it. The retry button fixes user-initiated
 * recovery; this helper fixes passive recovery — on GET, if a session
 * has been processing with no progress update for 15+ minutes, mark it
 * as failed so the UI stops showing "thinking" forever.
 *
 * 15 min is generous: legitimate deep research runs 8-12 min. Anything
 * past 15 with no progress update is almost certainly dead.
 */
const STUCK_THRESHOLD_MS = 15 * 60 * 1000

async function autoRecoverIfStuck(session: any) {
  const isProcessing =
    session.status === "PRESCOPING" || session.status === "RETRIEVING" ||
    session.status === "COMPOSING" || session.status === "EVALUATING"
  if (!isProcessing) return session

  const lastProgressAt =
    session.progress?.updatedAt ? new Date(session.progress.updatedAt).getTime()
    : session.compositionStartedAt ? new Date(session.compositionStartedAt).getTime()
    : session.retrievalStartedAt ? new Date(session.retrievalStartedAt).getTime()
    : session.createdAt ? new Date(session.createdAt).getTime()
    : 0

  if (Date.now() - lastProgressAt < STUCK_THRESHOLD_MS) return session

  console.warn(`[Research] Auto-recovering stuck session ${session.id} (status=${session.status})`)
  const minutesStuck = Math.floor((Date.now() - lastProgressAt) / 60000)
  const updated = await prisma.researchSession.update({
    where: { id: session.id },
    data: {
      status: "READY_FOR_REVIEW",
      output: `## Research Interrupted\n\nThis research did not complete. The last progress update was ${minutesStuck} minutes ago, which is past the 15-minute stuck threshold — the background process likely timed out or was evicted.\n\nUse the **Retry** button to run the research again. If it fails repeatedly, contact support.`,
      completedAt: new Date(),
      progress: null as any,
    },
  })
  return { ...session, ...updated }
}

/**
 * GET /api/research/sessions/[sessionId]
 * Return full session detail including sources and review actions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params

    let session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        sources: {
          orderBy: { authorityScore: "desc" },
        },
        reviewActions: {
          include: {
            practitioner: { select: { id: true, name: true, email: true } },
          },
          orderBy: { reviewStartedAt: "desc" },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    session = await autoRecoverIfStuck(session)

    return NextResponse.json(decryptEmbeddedCaseClientName(session))
  } catch (error: any) {
    console.error("[Research Session Detail] GET error:", error.message)
    return NextResponse.json(
      { error: "Failed to retrieve research session" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/research/sessions/[sessionId]
 * Reset a stuck session back to INTAKE so it can be relaunched.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params
    const body = await req.json()

    if (body.status === "INTAKE") {
      const updated = await prisma.researchSession.update({
        where: { id: sessionId },
        data: { status: "INTAKE", output: null, completedAt: null, progress: null as any },
      })
      return NextResponse.json({ id: updated.id, status: updated.status })
    }

    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 })
  } catch (error: any) {
    console.error("[Research Session] PATCH error:", error.message)
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 })
  }
}
