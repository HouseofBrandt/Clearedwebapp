import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { loadPrompt } from "@/lib/ai/prompts"
import { logAudit } from "@/lib/ai/audit"
import { z } from "zod"

const planSchema = z.object({
  caseId: z.string().min(1),
  assignmentText: z.string().min(1, "Assignment text is required"),
  casePosture: z.object({
    collectionStage: z.string().optional(),
    deadlinesApproaching: z.array(z.string()).optional(),
    reliefSought: z.string().optional(),
    priorAttempts: z.array(z.string()).optional(),
    additionalContext: z.string().optional(),
  }).optional(),
  model: z.enum(["claude-opus-4-6", "claude-sonnet-4-6"]).optional(),
})

function buildOrchestratorContext(
  caseData: any,
  documents: any[],
  intelligence: any,
  existingTasks: any[]
): string {
  return `CASE: ${caseData.tabsNumber} — ${caseData.clientName}
Type: ${caseData.caseType} | Status: ${caseData.status} | Filing: ${caseData.filingStatus || "Unknown"}

DOCUMENTS (${documents.length} uploaded):
${documents.map((d: any) =>
  `- ${d.fileName} [${d.documentCategory}] ${d.extractedText ? "\u2713 text extracted" : "\u2717 no text"}`
).join("\n")}

CASE INTELLIGENCE:
- Document completeness: ${Math.round((intelligence?.docCompleteness || 0) * 100)}%
- Documents received: ${intelligence?.docsReceivedCount || 0} of ${intelligence?.docsRequiredCount || 0} required
- Resolution phase: ${intelligence?.resolutionPhase || "Unknown"}
- IRS last action: ${intelligence?.irsLastAction || "None recorded"}
${intelligence?.lastAssessmentSummary ? `- Last assessment: ${intelligence.lastAssessmentSummary.substring(0, 500)}` : ""}

EXISTING AI TASKS:
${existingTasks.map((t: any) =>
  `- ${t.taskType} (${t.status}) \u2014 ${new Date(t.createdAt).toLocaleDateString()}`
).join("\n") || "None"}`
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "AI service is not configured" }), { status: 503, headers: { "Content-Type": "application/json" } })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const parsed = planSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues.map((i) => i.message).join(", ") }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const { caseId, assignmentText, casePosture, model: requestedModel } = parsed.data
  const userId = auth.userId
  const model = requestedModel || "claude-opus-4-6"

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: true,
      intelligence: true,
      aiTasks: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!caseData) {
    return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  try {
    const orchestratorPrompt = loadPrompt("banjo_orchestrator_v1")
    const context = buildOrchestratorContext(caseData, caseData.documents, caseData.intelligence, caseData.aiTasks)

    let userMessage = `ASSIGNMENT:\n${assignmentText}\n\n${context}`

    if (casePosture && (casePosture.collectionStage || casePosture.reliefSought)) {
      userMessage += `\n\nCASE POSTURE:\n`
      if (casePosture.collectionStage) userMessage += `Collection Stage: ${casePosture.collectionStage}\n`
      if (casePosture.deadlinesApproaching?.length) userMessage += `Key Deadlines: ${casePosture.deadlinesApproaching.join(", ")}\n`
      if (casePosture.reliefSought) userMessage += `Relief Sought: ${casePosture.reliefSought}\n`
      if (casePosture.priorAttempts?.length) userMessage += `Prior Attempts: ${casePosture.priorAttempts.join(", ")}\n`
      if (casePosture.additionalContext) userMessage += `Additional Context: ${casePosture.additionalContext}\n`
    }

    const response = await callClaude({
      systemPrompt: orchestratorPrompt,
      userMessage,
      model,
      temperature: 0.1,
      maxTokens: 2048,
    })

    let plan: any
    try {
      plan = JSON.parse(response.content)
    } catch {
      // Try to extract JSON from response
      const match = response.content.match(/\{[\s\S]*\}/)
      if (match) {
        plan = JSON.parse(match[0])
      } else {
        throw new Error("Orchestrator did not return valid JSON")
      }
    }

    const status = plan.needsClarification ? "CLARIFYING" : "AWAITING_APPROVAL"

    const assignment = await prisma.banjoAssignment.create({
      data: {
        caseId,
        assignmentText,
        plan: plan.plan,
        clarifications: plan.needsClarification ? plan.questions : undefined,
        assumptions: plan.plan?.assumptions || undefined,
        status,
        totalSteps: plan.plan?.deliverables?.length || 0,
        model,
        createdById: userId,
      },
    })

    logAudit({
      userId,
      caseId,
      action: "BANJO_PLAN_CREATED",
      metadata: { assignmentId: assignment.id, status, model },
    }).catch(() => {})

    if (plan.needsClarification) {
      return Response.json({
        assignmentId: assignment.id,
        status: "clarifying",
        questions: plan.questions,
        plan: plan.plan,
      })
    }

    return Response.json({
      assignmentId: assignment.id,
      status: "plan_ready",
      plan: plan.plan,
    })
  } catch (error: any) {
    console.error("[Banjo Plan] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message || "Failed to generate plan" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}
