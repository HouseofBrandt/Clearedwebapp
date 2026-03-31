import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { validateForExport } from "@/lib/banjo/export-validation"

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
        where: { status: "APPROVED" },
        orderBy: { banjoStepNumber: "asc" },
        select: {
          id: true,
          taskType: true,
          status: true,
          detokenizedOutput: true,
          banjoStepNumber: true,
          banjoStepLabel: true,
          verifyFlagCount: true,
          judgmentFlagCount: true,
        },
      },
    },
  })

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  if (assignment.tasks.length === 0) {
    return Response.json({
      valid: false,
      errors: [{ taskId: "", stepNumber: 0, stepLabel: "Assignment", errors: ["No approved deliverables found"], severity: "error" }],
      warnings: [],
    })
  }

  const result = validateForExport(assignment.tasks)
  return Response.json(result)
}
