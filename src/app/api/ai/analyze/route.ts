import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { callClaudeStream } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText, validateTokenization } from "@/lib/ai/tokenizer"
import { logAIRequest } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"
import { OIC_TEMPLATE, getExtractionKeys } from "@/lib/templates/oic-working-papers"
import { z } from "zod"

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
] as const

const VALID_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6"] as const

const analyzeSchema = z.object({
  caseId: z.string().min(1, "caseId is required"),
  taskType: z.enum(VALID_TASK_TYPES, {
    error: `taskType must be one of: ${VALID_TASK_TYPES.join(", ")}`,
  }),
  additionalContext: z.string().optional(),
  model: z.enum(VALID_MODELS).optional(),
})

// Each task type maps to its specific prompt file
const TASK_TYPE_TO_PROMPT: Record<string, string> = {
  WORKING_PAPERS: "oic_extraction_v1",
  CASE_MEMO: "case_memo_v1",
  PENALTY_LETTER: "penalty_abatement_v1",
  OIC_NARRATIVE: "oic_analysis_v1",
  GENERAL_ANALYSIS: "case_analysis_v1",
  IA_ANALYSIS: "ia_analysis_v1",
  CNC_ANALYSIS: "cnc_analysis_v1",
  TFRP_ANALYSIS: "tfrp_analysis_v1",
  INNOCENT_SPOUSE_ANALYSIS: "innocent_spouse_v1",
}

// Tasks that use the template+extraction pipeline (structured JSON output)
const TEMPLATE_TASKS = ["WORKING_PAPERS"]

// Tasks that produce long detailed output and need more token room
const HIGH_TOKEN_TASKS = ["GENERAL_ANALYSIS", "TFRP_ANALYSIS", "CASE_MEMO", "OIC_NARRATIVE"]

/** Send a JSON line to the stream controller */
function sendEvent(controller: ReadableStreamDefaultController, data: Record<string, any>) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"))
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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

  const { caseId, taskType, additionalContext, model: requestedModel } = parsed.data
  const userId = (session.user as any).id

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

      try {
        // Phase 1: Setup (fast — DB writes, tokenization)
        sendEvent(controller, { status: "processing", phase: "Preparing documents..." })

        // Create the AI task record
        const aiTask = await prisma.aITask.create({
          data: {
            caseId,
            taskType,
            status: "PROCESSING",
            createdById: userId,
          },
        })
        aiTaskId = aiTask.id

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
        const systemPrompt = `${corePrompt}\n\n${taskPrompt}`

        // Build user message
        let userMessage = `Case Type: ${caseData.caseType}\nCase Number: ${caseData.caseNumber}\n\n`
        userMessage += `Documents:\n${tokenizedDocText}`
        if (tokenizedContext) {
          userMessage += `\n\nAdditional Context:\n${tokenizedContext}`
        }

        if (DEBUG) {
          console.log(`[AI Analyze] Sending to Claude: ${userMessage.length} chars user message, ${systemPrompt.length} chars system prompt`)
        }

        // Determine model and token settings
        const isTemplateTask = TEMPLATE_TASKS.includes(taskType)
        const defaultModel = isTemplateTask
          ? "claude-sonnet-4-6"
          : taskType === "OIC_NARRATIVE" ? "claude-opus-4-6" : "claude-sonnet-4-6"
        const model = requestedModel || defaultModel
        const maxTokens = isTemplateTask ? 8192 : (HIGH_TOKEN_TASKS.includes(taskType) ? 16384 : 8192)
        const temperature = isTemplateTask ? 0.1 : 0.2

        // Phase 2: Stream Claude API response
        sendEvent(controller, { status: "processing", phase: "AI is generating response..." })

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

        claudeStream.on("text", (text) => {
          fullContent += text
          chunkCount++
          // Send a keepalive heartbeat every 20 chunks to keep the connection alive
          if (chunkCount % 20 === 0) {
            sendEvent(controller, {
              status: "processing",
              phase: "AI is generating response...",
              progress: fullContent.length,
            })
          }
        })

        // Wait for the full message to complete
        const finalMessage = await claudeStream.finalMessage()

        const responseModel = finalMessage.model
        const inputTokens = finalMessage.usage.input_tokens
        const outputTokens = finalMessage.usage.output_tokens

        if (DEBUG) {
          console.log(`[AI Analyze] Claude response: ${fullContent.length} chars, model=${responseModel}, inputTokens=${inputTokens}, outputTokens=${outputTokens}`)
        }

        // Phase 3: Process results
        sendEvent(controller, { status: "processing", phase: "Processing results..." })

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

            await prisma.aITask.update({
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
            })

            await logAIRequest({
              aiTaskId: aiTask.id,
              practitionerId: userId,
              caseId,
              model: responseModel,
              requestId,
              systemPromptVersion: promptName,
              inputTokens,
              outputTokens,
            })

            sendEvent(controller, {
              status: "complete",
              taskId: aiTask.id,
              verifyFlagCount: verifyFlags,
              judgmentFlagCount: judgmentFlags,
              warning: "AI did not return structured data. Output saved as narrative text for review.",
            })
            controller.close()
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
        } else {
          // --- NARRATIVE PIPELINE ---
          detokenized = detokenizeText(fullContent, tokenMap)
          verifyFlags = (fullContent.match(/\[VERIFY\]/g) || []).length
          judgmentFlags = (fullContent.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
        }

        // Update AI task with results
        await prisma.aITask.update({
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
        })

        // Audit log
        await logAIRequest({
          aiTaskId: aiTask.id,
          practitionerId: userId,
          caseId,
          model: responseModel,
          requestId,
          systemPromptVersion: promptName,
          inputTokens,
          outputTokens,
        })

        sendEvent(controller, {
          status: "complete",
          taskId: aiTask.id,
          verifyFlagCount: verifyFlags,
          judgmentFlagCount: judgmentFlags,
        })
        controller.close()
      } catch (error: any) {
        console.error("AI analysis error:", error)

        if (aiTaskId) {
          await prisma.aITask.update({
            where: { id: aiTaskId },
            data: { status: "REJECTED" },
          }).catch((e) => console.error("Failed to update task status:", e))
        }

        let errorMessage = error.message || "AI analysis failed"
        if (error?.status === 401) {
          errorMessage = "Invalid API key. Please check your ANTHROPIC_API_KEY configuration."
        } else if (error?.status === 429) {
          errorMessage = "AI service rate limit exceeded. Please try again in a moment."
        }

        sendEvent(controller, { status: "error", error: errorMessage })
        controller.close()
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
