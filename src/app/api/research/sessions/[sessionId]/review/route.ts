import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { z } from "zod"

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "EDIT_APPROVE", "REJECT_REPROMPT", "REJECT_MANUAL"]),
  editedOutput: z.string().optional(),
  reviewNotes: z.string().optional(),
})

/**
 * POST /api/research/sessions/[sessionId]/review
 * Submit a review action for a research session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params
    const body = await request.json()
    const parsed = reviewSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { action, editedOutput, reviewNotes } = parsed.data

    // Validate session exists and is in a reviewable state
    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, caseId: true, mode: true },
    })

    if (!session) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    if (session.status !== "READY_FOR_REVIEW") {
      return NextResponse.json(
        { error: `Cannot review session in ${session.status} status. Must be READY_FOR_REVIEW.` },
        { status: 400 }
      )
    }

    // EDIT_APPROVE requires editedOutput
    if (action === "EDIT_APPROVE" && !editedOutput) {
      return NextResponse.json(
        { error: "editedOutput is required for EDIT_APPROVE action" },
        { status: 400 }
      )
    }

    // Determine new session status based on action
    const statusMap: Record<string, string> = {
      APPROVE: "APPROVED",
      EDIT_APPROVE: "APPROVED",
      REJECT_REPROMPT: "INTAKE",
      REJECT_MANUAL: "REJECTED",
    }
    const newStatus = statusMap[action]

    // Create the review record and update session in a transaction
    const [review, updatedSession] = await prisma.$transaction([
      prisma.researchReview.create({
        data: {
          sessionId,
          practitionerId: auth.userId,
          action,
          editedOutput: editedOutput ?? null,
          reviewNotes: reviewNotes ?? null,
          reviewStartedAt: new Date(),
          reviewCompletedAt: new Date(),
        },
      }),
      prisma.researchSession.update({
        where: { id: sessionId },
        data: {
          status: newStatus as any,
          // If EDIT_APPROVE, store the edited output
          ...(action === "EDIT_APPROVE" && editedOutput
            ? { output: editedOutput }
            : {}),
        },
      }),
    ])

    logAudit({
      userId: auth.userId,
      action: `RESEARCH_SESSION_REVIEWED`,
      caseId: session.caseId ?? undefined,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: {
        reviewAction: action,
        reviewId: review.id,
        newStatus,
      },
    })

    return NextResponse.json({
      review,
      session: { id: updatedSession.id, status: updatedSession.status },
    })
  } catch (error: any) {
    console.error("[Research Review] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 }
    )
  }
}
