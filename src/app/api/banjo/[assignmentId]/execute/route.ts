import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma, startDbKeepalive } from "@/lib/db"
import { callClaudeStream } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText } from "@/lib/ai/tokenizer"
import { encryptField } from "@/lib/encryption"
import { logAIRequest } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { getBanjoKnowledgeContext } from "@/lib/banjo/knowledge-retrieval"
import { getPromptBias } from "@/lib/switchboard/prompt-bias"
import { conductResearch } from "@/lib/research/web-research"
import { mergeTemplateWithData } from "@/lib/templates/oic-merge"
import { populateFromAIExtraction } from "@/lib/documents/liability"
import { notify } from "@/lib/notifications"
import { SOURCES_AND_ASSUMPTIONS_FOOTER } from "@/lib/banjo/prompt-footer"
import { canAccessCase } from "@/lib/auth/case-access"
import { formatPriorOutput } from "@/lib/banjo/context-formatter"
import { executeDag, type DeliverablePlan, type PriorOutput, type CompletedTask } from "@/lib/banjo/dag-executor"
import { runRevisionPass } from "@/lib/banjo/revision-pass"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"
import { createFeedEvent } from "@/lib/feed/create-event"
import { evaluateBanjoDeliverable } from "@/lib/reasoning/wrap"
import { EventEmitter } from "events"

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
  WEB_RESEARCH: "", // handled specially — no prompt file
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

  const hasAccess = await canAccessCase(userId, assignment.case.id)
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
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
  const deliverables: DeliverablePlan[] = (plan?.deliverables || []).map((d: any, i: number) => ({
    ...d,
    stepNumber: d.stepNumber || i + 1,
    dependsOn: d.dependsOn || [],
  }))

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
  const assignmentText = assignment.assignmentText
  const assignmentCasePosture = (assignment as any).casePosture
  const assignmentSkipRevision = (assignment as any).skipRevision || false

  // Decouple execution from the SSE stream so that navigating away
  // (closing the browser connection) does NOT abort the server-side work.
  // The execution emits events; the stream subscribes to them. If the
  // client disconnects, execution continues to completion.
  const emitter = new EventEmitter()
  emitter.setMaxListeners(20)

  // Emit a typed event (fire-and-forget if no listener)
  function emit(data: Record<string, any>) {
    emitter.emit("event", data)
  }

  // ── Execution logic (runs independently of client connection) ──────
  async function runExecution() {
    try {
      const documentText = caseData.documents
        .map((d: any) => `--- ${d.fileName} [${d.documentCategory}] ---\n${d.extractedText}`)
        .join("\n\n")

      if (!documentText.trim()) {
        emit({ type: "failed", assignmentId, error: "No extracted text in case documents" })
        await prisma.banjoAssignment.update({ where: { id: assignmentId }, data: { status: "FAILED" } })
        emit({ type: "_done" })
        return
      }

      // Tokenize once for all deliverables
      const knownNames = [caseData.clientName].filter(Boolean) as string[]
      const { tokenizedText: tokenizedDocText, tokenMap } = tokenizeText(documentText, knownNames)

      await prisma.tokenMap.create({
        data: { caseId: caseData.id, tokenMap: encryptTokenMap(tokenMap) },
      })

      // === DAG EXECUTION ===
      const executeOne = async (deliverable: DeliverablePlan, priorOutputs: PriorOutput[]): Promise<CompletedTask> => {
        const stepNumber = deliverable.stepNumber
        const taskType = deliverable.taskType as any
        const isTemplateTask = TEMPLATE_TASKS.includes(taskType)

        await prisma.banjoAssignment.update({
          where: { id: assignmentId },
          data: { currentStep: stepNumber },
        })

        // === WEB_RESEARCH task type: run web research instead of Claude generation ===
        if (taskType === "WEB_RESEARCH") {
          const researchTopic = (deliverable as any).researchTopic || deliverable.description || deliverable.label
          const researchScope = (deliverable as any).researchScope || "narrow"

          const result = await conductResearch({
            topic: researchTopic,
            context: `${caseData.caseType} case`,
            scope: researchScope,
            saveToKB: true,
            kbCategory: "CUSTOM",
            kbTags: [caseData.caseType.toLowerCase(), "banjo-research"],
            userId,
          })

          const task = await prisma.aITask.create({
            data: {
              caseId: caseData.id,
              taskType: "WEB_RESEARCH" as any,
              status: "APPROVED", // Research doesn't need review
              detokenizedOutput: result.fullText ? encryptField(result.fullText) : null,
              modelUsed: "claude-opus-4-6",
              banjoAssignmentId: assignmentId,
              banjoStepNumber: stepNumber,
              banjoStepLabel: deliverable.label,
              createdById: userId,
            },
          })

          return {
            step: stepNumber,
            taskId: task.id,
            output: result.fullText,
            label: deliverable.label,
            format: "research",
            verifyFlagCount: 0,
            judgmentFlagCount: 0,
          }
        }

        // Load prompts
        const corePrompt = loadPrompt("core_system_v1")
        const promptName = TASK_TYPE_TO_PROMPT[taskType] || "case_analysis_v1"
        const taskPrompt = loadPrompt(promptName)
        let systemPrompt = `${corePrompt}\n\n${taskPrompt}`

        // Deep, multi-query KB retrieval (guarded with timeout)
        try {
          const kbDocCount = await prisma.knowledgeDocument.count({ where: { isActive: true } })
          if (kbDocCount > 0) {
            const kbContext = await Promise.race([
              getBanjoKnowledgeContext({
                assignmentText,
                taskType,
                caseType: caseData.caseType,
                casePosture: assignmentCasePosture,
                documentCategories: caseData.documents.map((d: any) => d.documentCategory),
              }),
              new Promise<string>((_, reject) => setTimeout(() => reject(new Error("KB timeout")), 15_000)),
            ])
            if (kbContext) systemPrompt += kbContext
          }
        } catch { /* KB failure is non-fatal */ }

        // Inject review-based prompt bias (learning loop)
        try {
          const bias = await getPromptBias(caseData.caseType, taskType)
          if (bias) systemPrompt += "\n\n" + bias
        } catch { /* non-fatal */ }

        // Append Sources & Assumptions footer
        systemPrompt += SOURCES_AND_ASSUMPTIONS_FOOTER

        // Build user message
        let userMessage = `Case Type: ${caseData.caseType}\nTABS: ${caseData.tabsNumber}\n\n`
        userMessage += `Documents:\n${tokenizedDocText}`

        // Full unabridged context forwarding — re-tokenize to prevent PII leaking back to Claude
        if (priorOutputs.length > 0) {
          for (const prior of priorOutputs) {
            const formatted = formatPriorOutput(prior.output, prior.format)
            const { tokenizedText: reTokenized } = tokenizeText(formatted, knownNames)
            userMessage += `\n\n--- FULL OUTPUT FROM PRIOR DELIVERABLE: [Step ${prior.step} \u2014 ${prior.label}] ---\n`
            userMessage += `The following is the complete output of a prior step in this assignment. Reference specific findings, numbers, and conclusions directly.\n\n`
            userMessage += reTokenized
            userMessage += `\n--- END PRIOR OUTPUT ---\n`
          }
        }

        // Token settings
        const maxTokens = isTemplateTask ? 8192 : (HIGH_TOKEN_TASKS.includes(taskType) ? 12288 : 8192)
        const temperature = isTemplateTask ? 0.1 : 0.2

        emit({
          type: "progress",
          step: stepNumber,
          totalSteps: deliverables.length,
          phase: "generating",
          percent: 15,
          label: deliverable.label,
        })

        // Start DB keepalive
        const stopKeepalive = startDbKeepalive(30_000)

        try {
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
              emit({
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

          stopKeepalive()

          const responseModel = finalMessage.model
          const inputTokens = finalMessage.usage.input_tokens
          const outputTokens = finalMessage.usage.output_tokens

          // Process output
          emit({
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
              detokenized = detokenizeText(fullContent, tokenMap)
              verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
              judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
            }
          } else {
            detokenized = detokenizeText(fullContent, tokenMap)
            verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
            judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
          }

          // ── Reasoning Pipeline: evaluate before delivery ──────────
          let reasoningDecision: string = "skipped"
          let reasoningScore: number | null = null
          if (detokenized && typeof detokenized === "string" && taskType !== "WORKING_PAPERS") {
            // Working papers are structured JSON, not prose — skip evaluation
            try {
              const pipelineResult = await evaluateBanjoDeliverable({
                draft: detokenized,
                banjoTaskType: taskType,
                originalRequest: deliverable.label || taskType,
                sourceContext: detokenizeText(tokenizedDocText.substring(0, 8000), tokenMap),
                model: responseModel,
                caseId: caseData.id,
              })
              if (pipelineResult.pipelineDecision !== "skipped") {
                detokenized = pipelineResult.output
                reasoningDecision = pipelineResult.pipelineDecision
                reasoningScore = pipelineResult.pipelineScore
                console.log(`[Reasoning] ${taskType}: ${reasoningDecision} (score=${reasoningScore})`)
              }
            } catch (e: any) {
              console.warn("[Reasoning] Pipeline error, continuing:", e.message)
            }
          }

          // Determine status based on reasoning decision
          const taskStatus = reasoningDecision === "human_review"
            ? "READY_FOR_REVIEW" // flagged — needs human attention
            : "READY_FOR_REVIEW" // all outputs go to review queue regardless

          // Create AITask record
          const aiTask = await prisma.aITask.create({
            data: {
              caseId: caseData.id,
              taskType,
              status: taskStatus,
              tokenizedInput: tokenizedDocText.substring(0, 10000),
              tokenizedOutput: fullContent,
              detokenizedOutput: detokenized ? encryptField(typeof detokenized === "string" ? detokenized : JSON.stringify(detokenized)) : null,
              modelUsed: responseModel,
              temperature,
              systemPromptVersion: promptName,
              verifyFlagCount: verifyFlags,
              judgmentFlagCount: judgmentFlags,
              createdById: userId,
              banjoAssignmentId: assignmentId,
              banjoStepNumber: stepNumber,
              banjoStepLabel: deliverable.label,
              metadata: reasoningDecision !== "skipped" ? { reasoningDecision, reasoningScore } : undefined,
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

          return {
            step: stepNumber,
            taskId: aiTask.id,
            output: detokenized,
            label: deliverable.label,
            format: deliverable.format,
            verifyFlagCount: verifyFlags,
            judgmentFlagCount: judgmentFlags,
          }
        } catch (err) {
          stopKeepalive()
          throw err
        }
      }

      // Run DAG execution
      const dagResult = await executeDag(
        deliverables,
        executeOne,
        (event) => {
          if (event.type === "step_started") {
            emit({
              type: "progress",
              step: event.step,
              totalSteps: deliverables.length,
              phase: "starting",
              percent: 0,
              label: event.label,
            })
          } else if (event.type === "step_complete") {
            emit({
              type: "step_complete",
              step: event.step,
              taskId: event.taskId,
              verifyFlagCount: event.verifyFlagCount,
              judgmentFlagCount: event.judgmentFlagCount,
            })
          } else if (event.type === "step_failed") {
            emit({
              type: "step_failed",
              step: event.step,
              error: event.error,
            })
          } else if (event.type === "step_skipped") {
            emit({
              type: "step_skipped",
              step: event.step,
              reason: event.reason,
            })
          } else if (event.type === "parallel_started") {
            emit({
              type: "parallel_started",
              steps: event.steps,
            })
          }
        }
      )

      // Create SKIPPED AITask records for skipped deliverables
      for (const skippedStep of dagResult.skipped) {
        const skippedDeliverable = deliverables.find((d) => d.stepNumber === skippedStep)
        if (skippedDeliverable) {
          await prisma.aITask.create({
            data: {
              caseId: caseData.id,
              taskType: skippedDeliverable.taskType as any,
              status: "SKIPPED",
              detokenizedOutput: encryptField(`Skipped: dependency failed.`),
              createdById: userId,
              banjoAssignmentId: assignmentId,
              banjoStepNumber: skippedStep,
              banjoStepLabel: skippedDeliverable.label,
            },
          })
        }
      }

      // === REVISION PASS ===
      if (!assignmentSkipRevision && dagResult.completed.length > 1) {
        emit({ type: "revision_started", message: "Cross-checking all deliverables..." })

        await prisma.banjoAssignment.update({
          where: { id: assignmentId },
          data: { status: "POLISHING" },
        })

        try {
          const revisionResult = await runRevisionPass(
            assignmentId,
            dagResult.completed.map((t) => ({ step: t.step, taskId: t.taskId, output: t.output, label: t.label })),
            model
          )
          emit({
            type: "revision_complete",
            revisedCount: revisionResult.revisedCount,
            summary: revisionResult.summary,
          })
        } catch (revisionError: any) {
          console.error("[Banjo] Revision pass failed:", revisionError.message)
          await prisma.banjoAssignment.update({
            where: { id: assignmentId },
            data: {
              revisionRan: false,
              revisionResult: "Revision pass failed \u2014 deliverables were not cross-checked. Review carefully.",
            },
          })
          emit({
            type: "revision_complete",
            revisedCount: 0,
            summary: "Quality review could not complete. Deliverables have not been cross-checked for consistency.",
          })
        }
      }

      // Determine final status
      const finalStatus = dagResult.failed.length > 0 && dagResult.completed.length === 0
        ? "FAILED"
        : "COMPLETED"

      await prisma.banjoAssignment.update({
        where: { id: assignmentId },
        data: { status: finalStatus, completedAt: new Date() },
      })

      // Refresh case graph (fire-and-forget)
      computeCaseGraph(caseData.id).catch(() => {})

      // Log activity
      prisma.caseActivity.create({
        data: {
          caseId: caseData.id,
          userId,
          action: "BANJO_ASSIGNMENT_COMPLETE",
          description: `Banjo assignment completed: ${dagResult.completed.length} deliverable(s)${dagResult.failed.length > 0 ? `, ${dagResult.failed.length} failed` : ""}${dagResult.skipped.length > 0 ? `, ${dagResult.skipped.length} skipped` : ""}`,
          metadata: { assignmentId, completed: dagResult.completed.length, failed: dagResult.failed.length, skipped: dagResult.skipped.length },
        },
      }).catch(() => {})

      // Feed event
      createFeedEvent({
        eventType: "banjo_complete",
        caseId: caseData.id,
        eventData: {
          assignmentId,
          deliverableCount: dagResult.completed.length,
          deliverables: dagResult.completed.map((t) => {
            const d = deliverables.find((dl) => dl.stepNumber === t.step)
            return d?.label || d?.taskType || `Step ${t.step}`
          }),
        },
        content: `Banjo completed ${dagResult.completed.length} deliverable(s)`,
      }).catch(() => {})

      // Notify
      const practitionerId = caseData.assignedPractitionerId || userId
      notify({
        recipientId: practitionerId,
        type: "REVIEW_ASSIGNED",
        subject: `Banjo assignment ready for review`,
        body: `${dagResult.completed.length} deliverable(s) for ${caseData.tabsNumber} are ready for review.`,
        caseId: caseData.id,
      }).catch(() => {})

      emit({
        type: "complete",
        assignmentId,
        tasks: dagResult.completed.map((t) => ({ step: t.step, taskId: t.taskId })),
        failedSteps: dagResult.failed,
        skippedSteps: dagResult.skipped,
      })
    } catch (error: any) {
      console.error("[Banjo Execute] Fatal:", error.message)

      await prisma.banjoAssignment.update({
        where: { id: assignmentId },
        data: { status: "FAILED" },
      }).catch(() => {})

      emit({ type: "failed", assignmentId, error: error.message || "Execution failed" })
    } finally {
      emit({ type: "_done" })
    }
  }

  // Start execution immediately — this runs to completion regardless of
  // whether the client stays connected to the SSE stream.
  const executionPromise = runExecution()

  // ── SSE stream (thin subscriber — if client disconnects, execution continues) ──
  let streamClosed = false
  const stream = new ReadableStream({
    start(controller) {
      const handler = (data: Record<string, any>) => {
        if (streamClosed) return
        if (data.type === "_done") {
          safeClose(controller)
          streamClosed = true
          emitter.removeAllListeners("event")
          return
        }
        sendEvent(controller, data)
      }
      emitter.on("event", handler)
    },
    cancel() {
      // Client disconnected — stop listening but do NOT stop execution
      streamClosed = true
      emitter.removeAllListeners("event")
    },
  })

  // Ensure execution completes even if the response is returned early
  // On Vercel, the function stays alive as long as a promise is pending
  executionPromise.catch(() => {})

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
