import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma, startDbKeepalive } from "@/lib/db"
import { callClaudeStream } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText, validateTokenization } from "@/lib/ai/tokenizer"
import { logAIRequest } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"
import { OIC_TEMPLATE, getExtractionKeys } from "@/lib/templates/oic-working-papers"
import { z } from "zod"
import { populateFromAIExtraction } from "@/lib/documents/liability"
import { getKnowledgeContext } from "@/lib/knowledge/context"
import { notify } from "@/lib/notifications"
import { trackError } from "@/lib/error-tracking"
import { getAppealsContext } from "@/lib/knowledge/appeals-context"

const DEBUG = process.env.NODE_ENV !== "production"

/**
 * Extract a JSON object from an AI response that may contain
 * preamble text, markdown fences, or trailing commentary.
 */
function extractJSON(text: string): Record<string, any> {
  const raw = text.trim()

  // Try 1: Direct parse (response is pure JSON)
  try {
    return JSON.parse(raw)
  } catch { /* continue */ }

  // Try 2: Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch { /* continue */ }
  }

  // Try 3: Find the first { and last } — extract the JSON object
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = raw.substring(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(jsonCandidate)
    } catch { /* continue */ }

    // Try 4: Fix common JSON issues (trailing commas, single quotes)
    try {
      const cleaned = jsonCandidate
        .replace(/,\s*}/g, "}")       // trailing commas before }
        .replace(/,\s*\]/g, "]")      // trailing commas before ]
        .replace(/'/g, '"')           // single quotes to double
        .replace(/(\w+)\s*:/g, '"$1":') // unquoted keys
      return JSON.parse(cleaned)
    } catch { /* continue */ }
  }

  throw new Error("Could not find valid JSON in AI response")
}

interface SuggestedDeadline {
  type: string
  title: string
  dueDate: string | null
  priority: string
  context: string
}

function extractDeadlinesFromOutput(text: string): SuggestedDeadline[] {
  const suggestions: SuggestedDeadline[] = []

  // CDP hearing deadline
  const cdpMatch = text.match(/CDP.*?(?:deadline|expired|window|request).*?(\w+ \d{1,2},?\s*\d{4})/i)
  if (cdpMatch) {
    suggestions.push({
      type: "CDP_HEARING",
      title: "CDP Hearing Request Deadline",
      dueDate: cdpMatch[1],
      priority: "CRITICAL",
      context: "Identified from AI analysis of IRS notice",
    })
  }

  // Tax Court petition
  const tcMatch = text.match(/Tax\s*Court.*?(?:petition|deadline|90.day).*?(\w+ \d{1,2},?\s*\d{4})/i)
  if (tcMatch) {
    suggestions.push({
      type: "TAX_COURT_PETITION",
      title: "Tax Court Petition Deadline",
      dueDate: tcMatch[1],
      priority: "CRITICAL",
      context: "90-day petition deadline identified from notice of deficiency",
    })
  }

  // CSED date
  const csedMatch = text.match(/CSED.*?(?:approximately|calculated|expir)?\s*(\w+ \d{1,2},?\s*\d{4})/i)
  if (csedMatch) {
    suggestions.push({
      type: "CSED_EXPIRATION",
      title: "Collection Statute Expiration",
      dueDate: csedMatch[1],
      priority: "HIGH",
      context: "CSED identified from transcript analysis",
    })
  }

  // Filing compliance
  if (text.match(/unfiled|delinquent\s*return|must\s*file|compliance\s*required/i)) {
    suggestions.push({
      type: "RETURN_DUE",
      title: "Delinquent Returns — File Before Resolution",
      dueDate: null,
      priority: "HIGH",
      context: "AI identified unfiled returns requiring compliance",
    })
  }

  // IRS response deadline
  const irsResponseMatch = text.match(/(?:respond|response|reply).*?(?:within|by|before).*?(\d+)\s*days/i)
  if (irsResponseMatch) {
    const days = parseInt(irsResponseMatch[1])
    const due = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    suggestions.push({
      type: "IRS_RESPONSE",
      title: `IRS Response — ${days}-Day Deadline`,
      dueDate: due.toISOString().split("T")[0],
      priority: "MEDIUM",
      context: `${days}-day response deadline identified in analysis`,
    })
  }

  return suggestions
}

const VALID_TASK_TYPES = [
  "WORKING_PAPERS",
  "CASE_MEMO",
  "PENALTY_LETTER",
  "OIC_NARRATIVE",
  "GENERAL_ANALYSIS",
  "IA_ANALYSIS",
  "CNC_ANALYSIS",
  "TFRP_ANALYSIS",
  "INNOCENT_SPOUSE_ANALYSIS",
  "APPEALS_REBUTTAL",
] as const

const VALID_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6"] as const

const casePostureSchema = z.object({
  collectionStage: z.string().optional(),
  deadlinesApproaching: z.array(z.string()).optional(),
  reliefSought: z.string().optional(),
  priorAttempts: z.array(z.string()).optional(),
  additionalContext: z.string().optional(),
}).optional()

const analyzeSchema = z.object({
  caseId: z.string().min(1, "caseId is required"),
  taskType: z.enum(VALID_TASK_TYPES, {
    error: `taskType must be one of: ${VALID_TASK_TYPES.join(", ")}`,
  }),
  additionalContext: z.string().optional(),
  model: z.enum(VALID_MODELS).optional(),
  casePosture: casePostureSchema,
})

// Each task type maps to its specific prompt file
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
}

// Tasks that use the template+extraction pipeline (structured JSON output)
const TEMPLATE_TASKS = ["WORKING_PAPERS"]

// Tasks that produce long detailed output and need more token room (12288 tokens)
const HIGH_TOKEN_TASKS = ["GENERAL_ANALYSIS", "TFRP_ANALYSIS", "CASE_MEMO", "OIC_NARRATIVE", "APPEALS_REBUTTAL", "INNOCENT_SPOUSE_ANALYSIS"]

/** Send a JSON line to the stream controller */
function sendEvent(controller: ReadableStreamDefaultController, data: Record<string, any>) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"))
}

/**
 * Safe stream helpers — swallow errors when the client has disconnected.
 * The analysis must complete and save to DB regardless of client state.
 */
function safeSendEvent(controller: ReadableStreamDefaultController, data: Record<string, any>) {
  try {
    sendEvent(controller, data)
  } catch {
    // Client disconnected — safe to ignore
  }
}

function safeClose(controller: ReadableStreamDefaultController) {
  try {
    controller.close()
  } catch {
    // Already closed or errored — safe to ignore
  }
}

// Ensure Vercel gives full execution time for streaming AI responses
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden: only licensed practitioners can run AI analysis" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI service is not configured. Please set the ANTHROPIC_API_KEY environment variable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }

  // Parse and validate request body before starting the stream
  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const parsed = analyzeSchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue: { message: string }) => issue.message)
    return new Response(JSON.stringify({ error: messages.join(", ") }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { caseId, taskType, additionalContext, model: requestedModel, casePosture } = parsed.data
  const userId = auth.userId

  // Fetch case with documents
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: { where: { extractedText: { not: null } } },
    },
  })

  if (!caseData) {
    return new Response(JSON.stringify({ error: "Case not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Rate limit: max 3 requests per case per 5 minutes
  const recentTasks = await prisma.aITask.count({
    where: { caseId, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
  })
  if (recentTasks >= 3) {
    return new Response(
      JSON.stringify({ error: "Too many analysis requests for this case. Please wait a few minutes before trying again." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    )
  }

  // Check document text
  const totalDocs = await prisma.document.count({ where: { caseId } })
  const docsWithText = caseData.documents.length
  if (DEBUG) {
    console.log(`[AI Analyze] Case ${caseId}: ${totalDocs} total docs, ${docsWithText} with extracted text`)
    for (const d of caseData.documents) {
      console.log(`  - ${d.fileName} (${d.documentCategory}): ${d.extractedText?.length || 0} chars`)
    }
  }

  const documentText = caseData.documents
    .map((d) => `--- ${d.fileName} [${d.documentCategory}] ---\n${d.extractedText}`)
    .join("\n\n")

  if (!documentText.trim()) {
    return new Response(
      JSON.stringify({
        error: `No extracted text found in case documents. ${totalDocs} document(s) uploaded but ${docsWithText} had extractable text. Scanned PDFs and images require OCR. Try uploading searchable PDFs or text files.`,
        totalDocuments: totalDocs,
        documentsWithText: docsWithText,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const MAX_DOCUMENT_CHARS = 350000
  if (documentText.length > MAX_DOCUMENT_CHARS) {
    return new Response(
      JSON.stringify({
        error: `Document text is too large (${(documentText.length / 1000).toFixed(0)}K chars, max ${MAX_DOCUMENT_CHARS / 1000}K). Try uploading fewer documents or splitting into multiple cases.`,
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    )
  }

  // --- All validation passed. Start the streaming response. ---
  // Everything from here runs inside the stream so we keep sending bytes
  // and avoid Vercel's 60s time-to-first-byte timeout.

  const stream = new ReadableStream({
    async start(controller) {
      let aiTaskId: string | null = null
      let stopKeepalive: (() => void) | null = null

      try {
        // Phase 1: Setup (fast — DB writes, tokenization)
        safeSendEvent(controller, { status: "processing", phase: "Preparing documents..." })

        // Create the AI task record
        const aiTask = await prisma.aITask.create({
          data: {
            caseId,
            taskType,
            status: "PROCESSING",
            createdById: userId,
            casePosture: casePosture || undefined,
          },
        })
        aiTaskId = aiTask.id
        console.log("[AI Analyze] Task created:", aiTask.id, "type:", taskType)

        // Log activity (fire-and-forget)
        prisma.caseActivity.create({
          data: {
            caseId,
            userId,
            action: "ANALYSIS_RUN",
            description: `Ran ${taskType} analysis`,
            metadata: { taskId: aiTask.id, taskType, model: requestedModel },
          },
        }).catch(() => {})

        // Tokenize PII
        const knownNames = [caseData.clientName].filter(Boolean) as string[]
        const { tokenizedText: tokenizedDocText, tokenMap: docTokenMap } =
          tokenizeText(documentText, knownNames)

        let tokenizedContext: string | undefined
        let tokenMap = { ...docTokenMap }

        if (additionalContext) {
          const contextResult = tokenizeText(additionalContext, knownNames)
          tokenizedContext = contextResult.tokenizedText
          tokenMap = { ...tokenMap, ...contextResult.tokenMap }
        }

        const tokenizedText = tokenizedContext
          ? `${tokenizedDocText}\n\n${tokenizedContext}`
          : tokenizedDocText
        console.log("[AI Analyze] Tokenized:", tokenizedText.length, "chars")

        // Store encrypted token map
        const encryptedMap = encryptTokenMap(tokenMap)
        await prisma.tokenMap.create({
          data: { caseId, tokenMap: encryptedMap },
        })

        // PII pre-flight validation
        const piiValidation = validateTokenization(tokenizedText)
        if (!piiValidation.passed) {
          console.warn("[AI Analyze] PII validation warnings:", piiValidation.warnings)
        }

        // Load system prompts
        const corePrompt = loadPrompt("core_system_v1")
        const promptName = TASK_TYPE_TO_PROMPT[taskType] || "case_analysis_v1"
        const taskPrompt = loadPrompt(promptName)
        let systemPrompt = `${corePrompt}\n\n${taskPrompt}`
        console.log("[AI Analyze] Prompts loaded, system:", systemPrompt.length, "chars")

        // Inject knowledge base context (skip embedding call if KB is empty)
        // Guard with a 10s timeout so KB issues never stall the analysis
        const kbDocCount = await prisma.knowledgeDocument.count({ where: { isActive: true } })
        if (kbDocCount > 0) {
          // For appeals rebuttals, use smart multi-query search that identifies
          // specific rejection reasons and pulls targeted KB material for each one
          if (taskType === "APPEALS_REBUTTAL") {
            try {
              const appealsContext = await getAppealsContext(
                tokenizedDocText,
                caseData.caseType,
                additionalContext
              )
              if (appealsContext) {
                systemPrompt += appealsContext
              }
            } catch (e: any) {
              console.warn("[AI Analyze] Appeals context failed:", e.message)
            }
          } else {
            try {
              const kbPromise = getKnowledgeContext(
                taskType,
                caseData.caseType,
                tokenizedDocText.substring(0, 2000),
                additionalContext
              )
              const KB_TIMEOUT = 10_000
              const knowledgeContext = await Promise.race([
                kbPromise,
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("Knowledge base search timed out")), KB_TIMEOUT)
                ),
              ])
              if (knowledgeContext) {
                systemPrompt += knowledgeContext
              }
            } catch (e: any) {
              console.warn("[AI Analyze] Knowledge context fetch failed:", e.message)
            }
          }
        }

        console.log("[AI Analyze] KB done, system prompt now:", systemPrompt.length, "chars")

        // Build user message
        let userMessage = ""

        // Prepend case posture if provided
        if (casePosture && (casePosture.collectionStage || casePosture.reliefSought)) {
          userMessage += "CASE POSTURE (provided by practitioner):\n"
          if (casePosture.collectionStage)
            userMessage += `Collection Stage: ${casePosture.collectionStage}\n`
          if (casePosture.deadlinesApproaching && casePosture.deadlinesApproaching.length > 0)
            userMessage += `Key Deadlines: ${casePosture.deadlinesApproaching.join(", ")}\n`
          if (casePosture.reliefSought)
            userMessage += `Relief Sought: ${casePosture.reliefSought}\n`
          if (casePosture.priorAttempts && casePosture.priorAttempts.length > 0)
            userMessage += `Prior Attempts: ${casePosture.priorAttempts.join(", ")}\n`
          if (casePosture.additionalContext)
            userMessage += `Additional Context: ${casePosture.additionalContext}\n`
          userMessage += "\nIMPORTANT: Tailor your analysis to this specific procedural posture. Do not analyze relief options that are procedurally unavailable given the current stage. If a CDP deadline is approaching, flag it as the #1 priority.\n\n"
        }

        userMessage += `Case Type: ${caseData.caseType}\nTABS: ${caseData.tabsNumber}\n\n`
        userMessage += `Documents:\n${tokenizedDocText}`
        if (tokenizedContext) {
          userMessage += `\n\nAdditional Context:\n${tokenizedContext}`
        }

        if (DEBUG) {
          console.log(`[AI Analyze] Sending to Claude: ${userMessage.length} chars user message, ${systemPrompt.length} chars system prompt`)
        }

        // Determine model and token settings
        const isTemplateTask = TEMPLATE_TASKS.includes(taskType)
        const defaultModel = "claude-sonnet-4-6"
        const model = requestedModel || defaultModel
        const maxTokens = isTemplateTask ? 8192 : (HIGH_TOKEN_TASKS.includes(taskType) ? 12288 : 8192)
        const temperature = isTemplateTask ? 0.1 : 0.2

        // Phase 2: Stream Claude API response
        console.log("[AI Analyze] Calling Claude:", model, "maxTokens:", maxTokens, "input:", userMessage.length, "chars")
        safeSendEvent(controller, { status: "processing", phase: "AI is generating response..." })

        // Keep DB connection warm during the potentially long Claude API call
        // so the Neon WebSocket doesn't go stale
        stopKeepalive = startDbKeepalive(30_000)

        const { stream: claudeStream, requestId } = callClaudeStream({
          systemPrompt,
          userMessage,
          model,
          temperature,
          maxTokens,
        })

        // Collect the full response while streaming keeps connection alive
        let fullContent = ""
        let chunkCount = 0

        // Register error handler to prevent unhandled EventEmitter errors
        let streamError: any = null
        claudeStream.on("error", (err: any) => {
          streamError = err
          console.error("[AI Analyze] Stream error:", err?.message || err)
        })

        // Periodic heartbeat timer — keeps data flowing even when Claude is
        // processing a large input context before producing the first token.
        // Without this, Vercel may kill the connection for inactivity.
        const heartbeat = setInterval(() => {
          safeSendEvent(controller, {
            status: "processing",
            phase: "AI is generating response...",
            progress: fullContent.length,
          })
        }, 15_000)

        claudeStream.on("text", (text) => {
          fullContent += text
          chunkCount++
          // Send a keepalive heartbeat every 10 chunks to keep the connection alive
          if (chunkCount % 10 === 0) {
            safeSendEvent(controller, {
              status: "processing",
              phase: "AI is generating response...",
              progress: fullContent.length,
            })
          }
        })

        // Wait for the full message to complete
        let finalMessage
        try {
          finalMessage = await claudeStream.finalMessage()
        } catch (streamErr: any) {
          // Re-throw with more context for the outer catch to handle
          const msg = streamErr?.message || streamError?.message || "Unknown stream error"
          const status = streamErr?.status || streamError?.status
          const err = new Error(`Claude API stream failed: ${msg}`)
          ;(err as any).status = status
          throw err
        } finally {
          clearInterval(heartbeat)
        }

        // Claude is done — stop the DB keepalive
        stopKeepalive()

        const responseModel = finalMessage.model
        const inputTokens = finalMessage.usage.input_tokens
        const outputTokens = finalMessage.usage.output_tokens
        console.log("[AI Analyze] Claude returned:", fullContent.length, "chars")

        if (DEBUG) {
          console.log(`[AI Analyze] Claude response: ${fullContent.length} chars, model=${responseModel}, inputTokens=${inputTokens}, outputTokens=${outputTokens}`)
        }

        // Phase 3: Process results
        safeSendEvent(controller, { status: "processing", phase: "Processing results..." })

        let detokenized: string
        let verifyFlags: number
        let judgmentFlags: number

        if (isTemplateTask) {
          // --- TEMPLATE + EXTRACTION PIPELINE ---
          let extractedData: Record<string, any>
          try {
            extractedData = extractJSON(fullContent)
            const keys = Object.keys(extractedData)
            const nonNullKeys = keys.filter(k => extractedData[k] != null)
            if (DEBUG) {
              console.log(`[AI Analyze] JSON parsed OK: ${keys.length} total keys, ${nonNullKeys.length} non-null`)
            }

            // Validate extracted keys against template expectations
            const expectedKeys = getExtractionKeys(OIC_TEMPLATE)
            const missingFromExtraction = expectedKeys.filter(k => !(k in extractedData))
            if (missingFromExtraction.length > 0) {
              console.warn(`[AI Analyze] Keys expected by template but missing from extraction: ${missingFromExtraction.join(", ")}`)
            }
          } catch (parseError: any) {
            console.error("[AI Analyze] FAILED to parse extraction JSON:", parseError.message)
            console.error("[AI Analyze] Full raw response:", fullContent.substring(0, 2000))

            // Fall back to narrative pipeline
            detokenized = detokenizeText(fullContent, tokenMap)
            verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
            judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length

            await Promise.all([
              prisma.aITask.update({
                where: { id: aiTask.id },
                data: {
                  status: "READY_FOR_REVIEW",
                  tokenizedInput: tokenizedText.substring(0, 10000),
                  tokenizedOutput: fullContent,
                  detokenizedOutput: detokenized,
                  modelUsed: responseModel,
                  temperature,
                  systemPromptVersion: promptName,
                  verifyFlagCount: verifyFlags,
                  judgmentFlagCount: judgmentFlags,
                },
              }),
              logAIRequest({
                aiTaskId: aiTask.id,
                practitionerId: userId,
                caseId,
                model: responseModel,
                requestId,
                systemPromptVersion: promptName,
                inputTokens,
                outputTokens,
              }),
            ])

            safeSendEvent(controller, {
              status: "complete",
              taskId: aiTask.id,
              verifyFlagCount: verifyFlags,
              judgmentFlagCount: judgmentFlags,
              warning: "AI did not return structured data. Output saved as narrative text for review.",
            })
            safeClose(controller)
            return
          }

          // Detokenize extracted string values
          const detokenizedData: Record<string, any> = {}
          for (const [key, value] of Object.entries(extractedData)) {
            if (typeof value === "string") {
              detokenizedData[key] = detokenizeText(value, tokenMap)
            } else if (Array.isArray(value)) {
              detokenizedData[key] = value.map((item: any) => {
                if (typeof item === "object" && item !== null) {
                  const detokenizedItem: Record<string, any> = {}
                  for (const [k, v] of Object.entries(item)) {
                    detokenizedItem[k] = typeof v === "string" ? detokenizeText(v, tokenMap) : v
                  }
                  return detokenizedItem
                }
                return typeof item === "string" ? detokenizeText(item, tokenMap) : item
              })
            } else {
              detokenizedData[key] = value
            }
          }

          // Merge with template
          const merged = mergeTemplateWithData(detokenizedData)

          if (DEBUG) {
            console.log(`[AI Analyze] Merge complete: ${merged.tabs.length} tabs, ${merged.validationIssues.length} validation issues`)
          }

          detokenized = JSON.stringify({
            _type: "oic_working_papers_v1",
            extracted: detokenizedData,
            merged: merged,
          })

          const detokenizedStr = JSON.stringify(detokenizedData)
          const embeddedVerify = (detokenizedStr.match(/\[VERIFY\]/g) || []).length
          const embeddedJudgment = (detokenizedStr.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
          verifyFlags = Math.max(
            merged.validationIssues.filter(i => i.severity === "warning").length +
              (detokenizedData.verify_flags?.length || 0),
            embeddedVerify,
          )
          judgmentFlags = Math.max(
            detokenizedData.practitioner_judgment_items?.length || 0,
            embeddedJudgment,
          )

          // Populate LiabilityPeriod from extracted tax_liability array
          if (detokenizedData.tax_liability || detokenizedData.tax_liabilities) {
            const liabilities = detokenizedData.tax_liability || detokenizedData.tax_liabilities
            populateFromAIExtraction(caseId, liabilities).catch((e) =>
              console.error("[AI Analyze] Liability population failed:", e.message)
            )
          }
        } else {
          // --- NARRATIVE PIPELINE ---
          console.log("[AI Analyze] Starting narrative detokenization...")
          detokenized = detokenizeText(fullContent, tokenMap)
          console.log("[AI Analyze] Detokenization complete:", detokenized.length, "chars")
          verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
          judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length

          // Try to extract structured liability data from narrative JSON blocks
          try {
            const jsonMatch = detokenized.match(/"tax_liabilit(?:y|ies)"\s*:\s*\[[\s\S]*?\]/)
            if (jsonMatch) {
              const parsed = JSON.parse(`{${jsonMatch[0]}}`)
              const arr = parsed.tax_liability || parsed.tax_liabilities
              if (Array.isArray(arr)) {
                populateFromAIExtraction(caseId, arr).catch((e) =>
                  console.error("[AI Analyze] Liability population failed:", e.message)
                )
              }
            }
          } catch {
            // Not critical — skip
          }
        }

        // Extract suggested deadlines from AI output
        const suggestedDeadlines = extractDeadlinesFromOutput(detokenized)

        // Persist to DB and notify the client in parallel — run the DB update
        // and audit log concurrently so post-processing is as fast as possible.
        // Send the "complete" event right after to minimize total function time.
        console.log("[AI Analyze] Starting DB persist...")
        const DB_TIMEOUT = 30_000  // 30s timeout for DB operations
        await Promise.race([
          Promise.all([
            prisma.aITask.update({
              where: { id: aiTask.id },
              data: {
                status: "READY_FOR_REVIEW",
                tokenizedInput: tokenizedText.substring(0, 10000),
                tokenizedOutput: fullContent,
                detokenizedOutput: detokenized,
                modelUsed: responseModel,
                temperature,
                systemPromptVersion: promptName,
                verifyFlagCount: verifyFlags,
                judgmentFlagCount: judgmentFlags,
                metadata: suggestedDeadlines.length > 0 ? { suggestedDeadlines: suggestedDeadlines as any } as any : undefined,
              },
            }),
            logAIRequest({
              aiTaskId: aiTask.id,
              practitionerId: userId,
              caseId,
              model: responseModel,
              requestId,
              systemPromptVersion: promptName,
              inputTokens,
              outputTokens,
            }),
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("DB persist timed out after 30s")), DB_TIMEOUT)
          ),
        ])
        console.log("[AI Analyze] DB persist complete")

        // Fire-and-forget notification
        const practitionerId = caseData.assignedPractitionerId || userId
        notify({
          recipientId: practitionerId,
          type: "REVIEW_ASSIGNED",
          subject: `${taskType.replace(/_/g, " ")} ready for review`,
          body: `AI analysis for ${caseData.tabsNumber} is ready for review.`,
          caseId,
          aiTaskId: aiTask.id,
        }).catch(() => {})

        safeSendEvent(controller, {
          status: "complete",
          taskId: aiTask.id,
          verifyFlagCount: verifyFlags,
          judgmentFlagCount: judgmentFlags,
        })
        safeClose(controller)
      } catch (error: any) {
        if (stopKeepalive) stopKeepalive()
        console.error("[AI Analyze] FATAL:", error)
        console.error("[AI Analyze] Stack:", error?.stack)

        Sentry.captureException(error, {
          tags: { route: "ai/analyze", taskType, caseId },
          extra: { model: requestedModel, phase: "stream" },
        })

        trackError({
          route: "/api/ai/analyze",
          error,
          userId,
          caseId,
          aiTaskId: aiTaskId || undefined,
          metadata: { taskType, model: requestedModel, phase: "stream" },
        }).catch(() => {})

        let errorMessage = error.message || "AI analysis failed"
        if (error?.status === 401) {
          errorMessage = "Invalid API key. Please check your ANTHROPIC_API_KEY configuration."
        } else if (error?.status === 429) {
          errorMessage = "AI service rate limit exceeded. Please try again in a moment."
        } else if (error?.status === 400) {
          errorMessage = `API request error: ${error.message}`
        } else if (error?.status === 529 || error?.status >= 500) {
          errorMessage = "AI service is temporarily unavailable. Please try again in a moment."
        }

        if (aiTaskId) {
          await prisma.aITask.update({
            where: { id: aiTaskId },
            data: {
              status: "REJECTED",
              detokenizedOutput: `Error: ${errorMessage}`,
            },
          }).catch((e) => console.error("Failed to update task status:", e))
        }

        safeSendEvent(controller, { status: "error", error: errorMessage })
        safeClose(controller)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
