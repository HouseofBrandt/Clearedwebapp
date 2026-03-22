import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { loadPrompt } from "@/lib/ai/prompts"
import { z } from "zod"

const clarifySchema = z.object({
  answers: z.record(z.string(), z.string()),
  additionalNotes: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const { assignmentId } = params

  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const parsed = clarifySchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues.map((i) => i.message).join(", ") }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      case: {
        include: {
          documents: true,
          intelligence: true,
          aiTasks: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      },
    },
  })

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  if (assignment.status !== "CLARIFYING") {
    return new Response(JSON.stringify({ error: "Assignment is not in clarification phase" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const { answers, additionalNotes } = parsed.data

  try {
    const orchestratorPrompt = loadPrompt("banjo_orchestrator_v1")

    const caseData = assignment.case
    const docList = caseData.documents.map((d: any) =>
      `- ${d.fileName} [${d.documentCategory}] ${d.extractedText ? "\u2713 text extracted" : "\u2717 no text"}`
    ).join("\n")

    let userMessage = `ASSIGNMENT:\n${assignment.assignmentText}\n\n`
    userMessage += `CASE: ${caseData.tabsNumber} \u2014 ${caseData.clientName}\n`
    userMessage += `Type: ${caseData.caseType} | Status: ${caseData.status}\n\n`
    userMessage += `DOCUMENTS (${caseData.documents.length}):\n${docList}\n\n`

    // Include original questions and answers
    const questions = assignment.clarifications as any[] || []
    userMessage += `CLARIFICATION ANSWERS:\n`
    for (const q of questions) {
      const answer = answers[q.id] || "No answer provided"
      userMessage += `Q: ${q.question}\nA: ${answer}\n\n`
    }
    if (additionalNotes) {
      userMessage += `Additional practitioner notes: ${additionalNotes}\n\n`
    }

    userMessage += `IMPORTANT: The practitioner has answered all clarification questions. Now produce the final plan with needsClarification set to false.`

    const response = await callClaude({
      systemPrompt: orchestratorPrompt,
      userMessage,
      model: assignment.model,
      temperature: 0.1,
      maxTokens: 2048,
    })

    let plan: any
    try {
      plan = JSON.parse(response.content)
    } catch {
      const match = response.content.match(/\{[\s\S]*\}/)
      if (match) {
        plan = JSON.parse(match[0])
      } else {
        throw new Error("Orchestrator did not return valid JSON")
      }
    }

    // Store answers and update plan
    await prisma.banjoAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "AWAITING_APPROVAL",
        clarifications: { questions, answers, additionalNotes } as any,
        plan: plan.plan,
        assumptions: plan.plan?.assumptions || undefined,
        totalSteps: plan.plan?.deliverables?.length || 0,
      },
    })

    return Response.json({
      assignmentId,
      status: "plan_ready",
      plan: plan.plan,
    })
  } catch (error: any) {
    console.error("[Banjo Clarify] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message || "Failed to process clarification" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}
