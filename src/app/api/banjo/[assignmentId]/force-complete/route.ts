import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function POST(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { assignmentId } = params

  // Only force-complete assignments that are stuck in POLISHING or EXECUTING
  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, status: true, updatedAt: true },
  })

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (assignment.status !== "POLISHING" && assignment.status !== "EXECUTING") {
    return NextResponse.json({ error: "Assignment is not in a stuck state" }, { status: 400 })
  }

  // Check if it's been stuck for at least 2 minutes
  const stuckDuration = Date.now() - new Date(assignment.updatedAt).getTime()
  if (stuckDuration < 120_000) {
    return NextResponse.json({ error: "Assignment is still processing, please wait" }, { status: 400 })
  }

  // Force complete — mark as COMPLETED with a note that revision was skipped
  await prisma.banjoAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "COMPLETED",
      revisionRan: false,
      revisionResult: "Quality review timed out. Deliverables were not cross-checked — review carefully.",
    },
  })

  return NextResponse.json({ success: true, message: "Assignment force-completed" })
}
