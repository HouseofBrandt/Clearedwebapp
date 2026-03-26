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

  // Find the most recent actively processing assignment (EXECUTING or POLISHING).
  // Tasks in PROCESSING for >10 minutes are considered stuck and do NOT block.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  const assignment = await prisma.banjoAssignment.findFirst({
    where: {
      caseId,
      OR: [
        // Actively executing and NOT stuck (started within last 10 minutes)
        { status: { in: ["EXECUTING", "POLISHING"] }, updatedAt: { gte: tenMinutesAgo } },
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

  // Also check for stuck assignments so the UI can offer a Cancel button
  const stuckAssignment = !assignment ? await prisma.banjoAssignment.findFirst({
    where: {
      caseId,
      status: { in: ["EXECUTING", "POLISHING"] },
      updatedAt: { lt: tenMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  }) : null

  if (!assignment) {
    return Response.json({
      assignment: null,
      stuckAssignment: stuckAssignment ? {
        id: stuckAssignment.id,
        status: stuckAssignment.status,
        stuckSince: stuckAssignment.updatedAt,
        stuckMinutes: Math.floor((Date.now() - new Date(stuckAssignment.updatedAt).getTime()) / 60_000),
      } : null,
    })
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
    stuckAssignment: null,
  })
}
