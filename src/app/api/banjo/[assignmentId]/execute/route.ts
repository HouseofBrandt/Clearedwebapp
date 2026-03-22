import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma, startDbKeepalive } from "@/lib/db"
import { callClaudeStream } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText } from "@/lib/ai/tokenizer"
import { logAIRequest, logAudit } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { getKnowledgeContext } from "@/lib/knowledge/context"
import { mergeTemplateWithData } from "@/lib/templates/oic-merge"
import { OIC_TEMPLATE, getExtractionKeys } from "@/lib/templates/oic-working-papers"
import { populateFromAIExtraction } from "@/lib/documents/liability"
import { notify } from "@/lib/notifications"
import { z } from "zod"

const TASK_TYPE_TO_PROMPT: Record<string, string> = {
  WORKING_PAPERS: "oic_extraction_v1",
  CASE_MEMO: "case_memo_v1",
  PENALTY_LETTER: "penalty_abatement_v1",
  OIC_NARRATIVE: "oic_narrative_v1",
  GENERAL_ANALYSIS: "case_analysis_v1",
  IA_ANALYSIS: "ia_analysis_v1",
  CNC_ANALYSIS: "cnc_analysis_v1",
  TFRP_ANALYSIS: "tfrp_analysis_v1",
  INNOCENT_SPOUSE_ANALYSIS: "innocent_spouse_v1",
  APPEALS_REBUTTAL: "appeals_rebuttal_v1",
  CASE_SUMMARY: "case_summary_v1",
  RISK_ASSESSMENT: "risk_assessment_v1",
}

const TEMPLATE_TASKS = ["WORKING_PAPERS"]
const HIGH_TOKEN_TASKS = ["GENERAL_ANALYSIS", "TFRP_ANALYSIS", "CASE_MEMO", "OIC_NARRATIVE", "APPEALS_REBUTTAL", "INNOCENT_SPOUSE_ANALYSIS", "CASE_SUMMARY", "RISK_ASSESSMENT"]

function sendEvent(controller: ReadableStreamDefaultController, data: Record<string, any>) {
  try {
    controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"))
  } catch {
    // Client disconnected
  }
}

function safeClose(controller: ReadableStreamDefaultController) {
  try { controller.close() } catch { /* already closed */ }
}

function extractJSON(text: string): Record<string, any> {
  try { return JSON.parse(text.trim()) } catch { /* continue */ }
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) } catch { /* continue */ }
  }
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)) } catch { /* continue */ }
  }
  throw new Error("Could not find valid JSON in AI response")
}

export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const { assignmentId } = params
  const userId = auth.userId

  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      case: {
        include: {
          documents: { where: { extractedText: { not: null } } },
        },
      },
    },
  })

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  if (assignment.status !== "AWAITING_APPROVAL") {
    return new Response(JSON.stringify({ error: `Assignment is in ${assignment.status} state, expected AWAITING_APPROVAL` }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  // Parse optional overrides
  let planOverrides: any = null
  try {
    const body = await request.json()
    planOverrides = body?.planOverrides
  } catch { /* no body or invalid JSON — use existing plan */ }

  const plan = planOverrides || (assignment.plan as any)
  const deliverables = plan?.deliverables || []

  if (deliverables.length === 0) {
    return new Response(JSON.stringify({ error: "No deliverables in plan" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  // Mark as executing
  await prisma.banjoAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "EXECUTING",
      startedAt: new Date(),
      currentStep: 1,
      totalSteps: deliverables.length,
      plan: planOverrides ? plan : undefined,
    },
  })

  const caseData = assignment.case
  const model = assignment.model

  const stream = new ReadableStream({
    async start(controller) {
      // Use object wrapper to avoid TypeScript narrowing issues in try/catch
      const keepalive = { stop: null as (() => void) | null }
      const completedTasks: { step: number; taskId: string; output: string }[] = []

      try {
        const documentText = caseData.documents
          .map((d: any) => `--- ${d.fileName} [${d.documentCategory}] ---\n${d.extractedText}`)
          .join("\n\n")

        if (!documentText.trim()) {
          sendEvent(controller, { type: "failed", assignmentId, error: "No extracted text in case documents" })
          await prisma.banjoAssignment.update({ where: { id: assignmentId }, data: { status: "FAILED" } })
          safeClose(controller)
          return
        }

        // Tokenize once for all deliverables
        const knownNames = [caseData.clientName].filter(Boolean) as string[]
        const { tokenizedText: tokenizedDocText, tokenMap } = tokenizeText(documentText, knownNames)

        await prisma.tokenMap.create({
          data: { caseId: caseData.id, tokenMap: encryptTokenMap(tokenMap) },
        })

        // Execute deliverables sequentially
        for (let i = 0; i < deliverables.length; i++) {
          const deliverable = deliverables[i]
          const stepNumber = deliverable.stepNumber || i + 1
          const taskType = deliverable.taskType
          const isTemplateTask = TEMPLATE_TASKS.includes(taskType)

          sendEvent(controller, {
            type: "progress",
            step: stepNumber,
            totalSteps: deliverables.length,
            phase: "starting",
            percent: 0,
            label: deliverable.label,
          })

          await prisma.banjoAssignment.update({
            where: { id: assignmentId },
            data: { currentStep: stepNumber },
          })

          try {
            // Load prompts
            const corePrompt = loadPrompt("core_system_v1")
            const promptName = TASK_TYPE_TO_PROMPT[taskType] || "case_analysis_v1"
            const taskPrompt = loadPrompt(promptName)
            let systemPrompt = `${corePrompt}\n\n${taskPrompt}`

            // Knowledge base context (guarded with timeout)
            try {
              const kbDocCount = await prisma.knowledgeDocument.count({ where: { isActive: true } })
              if (kbDocCount > 0) {
                const kbContext = await Promise.race([
                  getKnowledgeContext(taskType, caseData.caseType, tokenizedDocText.substring(0, 2000)),
                  new Promise<string>((_, reject) => setTimeout(() => reject(new Error("KB timeout")), 10_000)),
                ])
                if (kbContext) systemPrompt += kbContext
              }
            } catch { /* KB failure is non-fatal */ }

            // Build user message
            let userMessage = `Case Type: ${caseData.caseType}\nTABS: ${caseData.tabsNumber}\n\n`
            userMessage += `Documents:\n${tokenizedDocText}`

            // Context forwarding: inject prior deliverable summaries
            if (completedTasks.length > 0 && deliverable.dependsOn?.length > 0) {
              userMessage += `\n\n--- PRIOR DELIVERABLE OUTPUT (for reference) ---\n`
              userMessage += `The following is the output of a prior step in this assignment. Use it as context for your analysis. Do not repeat its contents verbatim \u2014 reference and build upon it.\n\n`
              for (const dep of deliverable.dependsOn) {
                const prior = completedTasks.find((t) => t.step === dep)
                if (prior) {
                  // Truncate to ~2000 tokens worth (~8000 chars)
                  const summary = prior.output.substring(0, 8000)
                  userMessage += `[Step ${dep} output]:\n${summary}\n\n`
                }
              }
              userMessage += `--- END PRIOR DELIVERABLE ---\n`
            }

            // Token settings
            const maxTokens = isTemplateTask ? 8192 : (HIGH_TOKEN_TASKS.includes(taskType) ? 12288 : 8192)
            const temperature = isTemplateTask ? 0.1 : 0.2

            sendEvent(controller, {
              type: "progress",
              step: stepNumber,
              totalSteps: deliverables.length,
              phase: "generating",
              percent: 15,
              label: deliverable.label,
            })

            // Start DB keepalive
            keepalive.stop = startDbKeepalive(30_000)

            const { stream: claudeStream, requestId } = callClaudeStream({
              systemPrompt,
              userMessage,
              model,
              temperature,
              maxTokens,
            })

            let fullContent = ""
            let chunkCount = 0
            let streamError: any = null

            claudeStream.on("error", (err: any) => { streamError = err })
            claudeStream.on("text", (text) => {
              fullContent += text
              chunkCount++
              if (chunkCount % 15 === 0) {
                const percent = Math.min(85, 15 + Math.round((fullContent.length / 8000) * 70))
                sendEvent(controller, {
                  type: "progress",
                  step: stepNumber,
                  totalSteps: deliverables.length,
                  phase: "generating",
                  percent,
                  label: deliverable.label,
                })
              }
            })

            let finalMessage
            try {
              finalMessage = await claudeStream.finalMessage()
            } catch (err: any) {
              throw new Error(`Claude API failed: ${err?.message || streamError?.message || "Unknown"}`)
            }

            if (keepalive.stop) { keepalive.stop(); keepalive.stop = null }

            const responseModel = finalMessage.model
            const inputTokens = finalMessage.usage.input_tokens
            const outputTokens = finalMessage.usage.output_tokens

            // Process output
            sendEvent(controller, {
              type: "progress",
              step: stepNumber,
              totalSteps: deliverables.length,
              phase: "finalizing",
              percent: 90,
              label: deliverable.label,
            })

            let detokenized: string
            let verifyFlags: number
            let judgmentFlags: number

            if (isTemplateTask) {
              try {
                const extractedData = extractJSON(fullContent)
                const detokenizedData: Record<string, any> = {}
                for (const [key, value] of Object.entries(extractedData)) {
                  if (typeof value === "string") {
                    detokenizedData[key] = detokenizeText(value, tokenMap)
                  } else if (Array.isArray(value)) {
                    detokenizedData[key] = value.map((item: any) => {
                      if (typeof item === "object" && item !== null) {
                        const d: Record<string, any> = {}
                        for (const [k, v] of Object.entries(item)) {
                          d[k] = typeof v === "string" ? detokenizeText(v, tokenMap) : v
                        }
                        return d
                      }
                      return typeof item === "string" ? detokenizeText(item, tokenMap) : item
                    })
                  } else {
                    detokenizedData[key] = value
                  }
                }
                const merged = mergeTemplateWithData(detokenizedData)
                detokenized = JSON.stringify({ _type: "oic_working_papers_v1", extracted: detokenizedData, merged })
                const detokenizedStr = JSON.stringify(detokenizedData)
                verifyFlags = Math.max(
                  merged.validationIssues.filter((i: any) => i.severity === "warning").length + (detokenizedData.verify_flags?.length || 0),
                  (detokenizedStr.match(/\[VERIFY\]/g) || []).length,
                )
                judgmentFlags = Math.max(
                  detokenizedData.practitioner_judgment_items?.length || 0,
                  (detokenizedStr.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length,
                )
                if (detokenizedData.tax_liability || detokenizedData.tax_liabilities) {
                  populateFromAIExtraction(caseData.id, detokenizedData.tax_liability || detokenizedData.tax_liabilities).catch(() => {})
                }
              } catch {
                // Fall back to narrative
                detokenized = detokenizeText(fullContent, tokenMap)
                verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
                judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
              }
            } else {
              detokenized = detokenizeText(fullContent, tokenMap)
              verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
              judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
            }

            // Create AITask record
            const aiTask = await prisma.aITask.create({
              data: {
                caseId: caseData.id,
                taskType,
                status: "READY_FOR_REVIEW",
                tokenizedInput: tokenizedDocText.substring(0, 10000),
                tokenizedOutput: fullContent,
                detokenizedOutput: detokenized,
                modelUsed: responseModel,
                temperature,
                systemPromptVersion: promptName,
                verifyFlagCount: verifyFlags,
                judgmentFlagCount: judgmentFlags,
                createdById: userId,
                banjoAssignmentId: assignmentId,
                banjoStepNumber: stepNumber,
                banjoStepLabel: deliverable.label,
              },
            })

            logAIRequest({
              aiTaskId: aiTask.id,
              practitionerId: userId,
              caseId: caseData.id,
              model: responseModel,
              requestId,
              systemPromptVersion: promptName,
              inputTokens,
              outputTokens,
            }).catch(() => {})

            completedTasks.push({ step: stepNumber, taskId: aiTask.id, output: detokenized })

            sendEvent(controller, {
              type: "step_complete",
              step: stepNumber,
              taskId: aiTask.id,
              verifyFlagCount: verifyFlags,
              judgmentFlagCount: judgmentFlags,
            })
          } catch (stepError: any) {
            if (keepalive.stop) { keepalive.stop(); keepalive.stop = null }
            console.error(`[Banjo Execute] Step ${stepNumber} failed:`, stepError.message)

            sendEvent(controller, {
              type: "step_failed",
              step: stepNumber,
              error: stepError.message || "Deliverable generation failed",
            })

            await prisma.banjoAssignment.update({
              where: { id: assignmentId },
              data: { status: "FAILED" },
            })

            sendEvent(controller, {
              type: "failed",
              assignmentId,
              completedSteps: completedTasks.length,
              failedStep: stepNumber,
              error: stepError.message,
            })
            safeClose(controller)
            return
          }
        }

        // All deliverables complete
        await prisma.banjoAssignment.update({
          where: { id: assignmentId },
          data: { status: "COMPLETED", completedAt: new Date() },
        })

        // Log activity
        prisma.caseActivity.create({
          data: {
            caseId: caseData.id,
            userId,
            action: "BANJO_ASSIGNMENT_COMPLETE",
            description: `Banjo assignment completed: ${deliverables.length} deliverable(s)`,
            metadata: { assignmentId, deliverableCount: deliverables.length },
          },
        }).catch(() => {})

        // Notify
        const practitionerId = caseData.assignedPractitionerId || userId
        notify({
          recipientId: practitionerId,
          type: "REVIEW_ASSIGNED",
          subject: `Banjo assignment ready for review`,
          body: `${deliverables.length} deliverable(s) for ${caseData.tabsNumber} are ready for review.`,
          caseId: caseData.id,
        }).catch(() => {})

        sendEvent(controller, {
          type: "complete",
          assignmentId,
          tasks: completedTasks.map((t) => ({ step: t.step, taskId: t.taskId })),
        })
        safeClose(controller)
      } catch (error: any) {
        keepalive.stop?.()
        console.error("[Banjo Execute] Fatal:", error.message)

        await prisma.banjoAssignment.update({
          where: { id: assignmentId },
          data: { status: "FAILED" },
        }).catch(() => {})

        sendEvent(controller, { type: "failed", assignmentId, error: error.message || "Execution failed" })
        safeClose(controller)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
