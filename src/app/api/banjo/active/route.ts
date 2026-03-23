import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const { searchParams } = new URL(request.url)
  const caseId = searchParams.get("caseId")

  if (!caseId) {
    return new Response(JSON.stringify({ error: "caseId is required" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  // Find the most recent non-terminal assignment (EXECUTING, POLISHING, or COMPLETED within the last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const assignment = await prisma.banjoAssignment.findFirst({
    where: {
      caseId,
      OR: [
        { status: { in: ["EXECUTING", "POLISHING"] } },
        { status: "COMPLETED", completedAt: { gte: oneHourAgo } },
      ],
    },
    orderBy: { createdAt: "desc" },
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
        },
      },
    },
  })

  if (!assignment) {
    return Response.json({ assignment: null })
  }

  return Response.json({
    assignment: {
      id: assignment.id,
      status: assignment.status,
      plan: assignment.plan,
      model: assignment.model,
      currentStep: assignment.currentStep,
      totalSteps: assignment.totalSteps,
      revisionRan: assignment.revisionRan,
      revisionResult: assignment.revisionResult,
      tasks: assignment.tasks,
      createdAt: assignment.createdAt,
      completedAt: assignment.completedAt,
    },
  })
}
