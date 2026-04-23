import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

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

    const session = await prisma.researchSession.findUnique({
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
