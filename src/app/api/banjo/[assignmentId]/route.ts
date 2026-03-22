import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      tasks: {
        orderBy: { banjoStepNumber: "asc" },
        select: {
          id: true,
          taskType: true,
          status: true,
          verifyFlagCount: true,
          judgmentFlagCount: true,
          banjoStepNumber: true,
          banjoStepLabel: true,
          createdAt: true,
        },
      },
    },
  })

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  return Response.json({
    id: assignment.id,
    status: assignment.status,
    assignmentText: assignment.assignmentText,
    plan: assignment.plan,
    assumptions: assignment.assumptions,
    clarifications: assignment.clarifications,
    currentStep: assignment.currentStep,
    totalSteps: assignment.totalSteps,
    model: assignment.model,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    createdAt: assignment.createdAt,
    tasks: assignment.tasks,
  })
}
