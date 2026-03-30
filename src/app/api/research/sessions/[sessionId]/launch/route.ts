import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

/**
 * POST /api/research/sessions/[sessionId]/launch
 * Transition session from INTAKE to RETRIEVING.
 * The actual research engine will be implemented in Phase 2.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params

    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, caseId: true, mode: true },
    })

    if (!session) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    if (session.status !== "INTAKE") {
      return NextResponse.json(
        { error: `Cannot launch session in ${session.status} status. Must be INTAKE.` },
        { status: 400 }
      )
    }

    const updated = await prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        status: "RETRIEVING",
        retrievalStartedAt: new Date(),
      },
    })

    logAudit({
      userId: auth.userId,
      action: "RESEARCH_SESSION_LAUNCHED",
      caseId: session.caseId ?? undefined,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: { mode: session.mode },
    })

    return NextResponse.json(
      { id: updated.id, status: updated.status, message: "Research session launched" },
      { status: 202 }
    )
  } catch (error: any) {
    console.error("[Research Launch] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to launch research session" },
      { status: 500 }
    )
  }
}
