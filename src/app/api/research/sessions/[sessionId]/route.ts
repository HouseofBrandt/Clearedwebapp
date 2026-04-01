import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

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

    return NextResponse.json(session)
  } catch (error: any) {
    console.error("[Research Session Detail] GET error:", error.message)
    return NextResponse.json(
      { error: "Failed to retrieve research session" },
      { status: 500 }
    )
  }
}
