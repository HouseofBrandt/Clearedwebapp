import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function POST(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: params.assignmentId },
  })

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  if (assignment.status === "COMPLETED" || assignment.status === "CANCELLED") {
    return new Response(JSON.stringify({ error: `Cannot cancel: assignment is ${assignment.status}` }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  await prisma.banjoAssignment.update({
    where: { id: params.assignmentId },
    data: { status: "CANCELLED" },
  })

  return Response.json({ status: "cancelled", assignmentId: params.assignmentId })
}
