import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText } from "@/lib/ai/tokenizer"
import { logAIRequest } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"
import { OIC_TEMPLATE, getExtractionKeys } from "@/lib/templates/oic-working-papers"
import { z } from "zod"

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
] as const

const analyzeSchema = z.object({
  caseId: z.string().min(1, "caseId is required"),
  taskType: z.enum(VALID_TASK_TYPES, {
    error: `taskType must be one of: ${VALID_TASK_TYPES.join(", ")}`,
  }),
  additionalContext: z.string().optional(),
})

// Template+extraction pipeline uses the extraction prompt
// Narrative tasks use their original prompts
const TASK_TYPE_TO_PROMPT: Record<string, string> = {
  WORKING_PAPERS: "oic_extraction_v1",  // NEW: extraction-only prompt
  CASE_MEMO: "case_analysis_v1",
  PENALTY_LETTER: "penalty_abatement_v1",
  OIC_NARRATIVE: "oic_analysis_v1",
  GENERAL_ANALYSIS: "case_analysis_v1",
}

// Tasks that use the template+extraction pipeline
const TEMPLATE_TASKS = ["WORKING_PAPERS"]

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI service is not configured. Please set the ANTHROPIC_API_KEY environment variable." },
      { status: 503 }
    )
  }

  let aiTaskId: string | null = null

  try {
    const body = await request.json()

    const parsed = analyzeSchema.safeParse(body)
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue: { message: string }) => issue.message)
      return NextResponse.json({ error: messages.join(", ") }, { status: 400 })
    }
    const { caseId, taskType, additionalContext } = parsed.data

    // Fetch case with documents
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        documents: { where: { extractedText: { not: null } } },
      },
    })

    if (!caseData) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Rate limit: max 3 requests per case per 5 minutes
    const recentTasks = await prisma.aITask.count({
      where: { caseId, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    })
    if (recentTasks >= 3) {
      return NextResponse.json(
        { error: "Too many analysis requests for this case. Please wait a few minutes before trying again." },
        { status: 429 }
      )
    }

    // Log document extraction status for debugging
    const totalDocs = await prisma.document.count({ where: { caseId } })
    const docsWithText = caseData.documents.length
    console.log(`[AI Analyze] Case ${caseId}: ${totalDocs} total docs, ${docsWithText} with extracted text`)
    for (const d of caseData.documents) {
      console.log(`  - ${d.fileName} (${d.documentCategory}): ${d.extractedText?.length || 0} chars`)
    }

    const documentText = caseData.documents
      .map((d) => `--- ${d.fileName} [${d.documentCategory}] ---\n${d.extractedText}`)
      .join("\n\n")

    if (!documentText.trim()) {
      return NextResponse.json(
        {
          error: `No extracted text found in case documents. ${totalDocs} document(s) uploaded but ${docsWithText} had extractable text. Scanned PDFs and images require OCR. Try uploading searchable PDFs or text files.`,
          totalDocuments: totalDocs,
          documentsWithText: docsWithText,
        },
        { status: 400 }
      )
    }

    // Guard against exceeding Claude's context window (~200k tokens ≈ ~600k chars)
    const MAX_INPUT_CHARS = 400000
    if (documentText.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `Document text is too large (${(documentText.length / 1000).toFixed(0)}K chars, max ${MAX_INPUT_CHARS / 1000}K). Try uploading fewer documents or splitting into multiple cases.`,
        },
        { status: 413 }
      )
    }

    // Create the AI task record
    const aiTask = await prisma.aITask.create({
      data: {
        caseId,
        taskType,
        status: "PROCESSING",
        createdById: (session.user as any).id,
      },
    })
    aiTaskId = aiTask.id

    // Tokenize PII — tokenize documents and context SEPARATELY to avoid
    // substring miscalculation (tokenization changes text length)
    const knownNames = [caseData.clientName]
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

    console.log(`[AI Analyze] Sending to Claude: ${userMessage.length} chars user message, ${systemPrompt.length} chars system prompt`)
    console.log(`[AI Analyze] Document text preview (first 500 chars): ${tokenizedDocText.substring(0, 500)}`)

    // Use sonnet for extraction (reliable, fast), opus for complex narrative
    const isTemplateTask = TEMPLATE_TASKS.includes(taskType)
    const model = isTemplateTask
      ? "claude-sonnet-4-6"   // Extraction is simpler — sonnet is reliable and cheaper
      : taskType === "OIC_NARRATIVE" ? "claude-opus-4-6" : "claude-sonnet-4-6"
    const maxTokens = isTemplateTask ? 8192 : 8192
    const temperature = isTemplateTask ? 0.1 : 0.2  // Lower temp for structured extraction

    // Call Claude API
    const response = await callClaude({
      systemPrompt,
      userMessage,
      model,
      temperature,
      maxTokens,
    })

    let detokenized: string
    let verifyFlags: number
    let judgmentFlags: number

    console.log(`[AI Analyze] Claude response: ${response.content.length} chars, model=${response.model}, inputTokens=${response.inputTokens}, outputTokens=${response.outputTokens}`)
    console.log(`[AI Analyze] Response preview (first 300 chars): ${response.content.substring(0, 300)}`)

    if (isTemplateTask) {
      // --- TEMPLATE + EXTRACTION PIPELINE ---
      // Parse the JSON extraction response
      let extractedData: Record<string, any>
      try {
        extractedData = extractJSON(response.content)
        // Log extraction success with key counts
        const keys = Object.keys(extractedData)
        const nonNullKeys = keys.filter(k => extractedData[k] != null)
        console.log(`[AI Analyze] JSON parsed OK: ${keys.length} total keys, ${nonNullKeys.length} non-null`)
        console.log(`[AI Analyze] Non-null keys: ${nonNullKeys.join(", ")}`)
        const nullKeys = keys.filter(k => extractedData[k] == null)
        if (nullKeys.length > 0) {
          console.log(`[AI Analyze] Null keys: ${nullKeys.join(", ")}`)
        }

        // Validate extracted keys against template expectations
        const expectedKeys = getExtractionKeys(OIC_TEMPLATE)
        const missingFromExtraction = expectedKeys.filter(k => !(k in extractedData))
        const extraKeys = keys.filter(k => !expectedKeys.includes(k))
        if (missingFromExtraction.length > 0) {
          console.warn(`[AI Analyze] Keys expected by template but missing from extraction: ${missingFromExtraction.join(", ")}`)
        }
        if (extraKeys.length > 0) {
          console.log(`[AI Analyze] Extra keys from AI (not in template): ${extraKeys.join(", ")}`)
        }
      } catch (parseError: any) {
        console.error("[AI Analyze] FAILED to parse extraction JSON:", parseError.message)
        console.error("[AI Analyze] Full raw response:", response.content.substring(0, 2000))

        // Fall back to narrative pipeline — store the raw text instead of failing
        detokenized = detokenizeText(response.content, tokenMap)
        verifyFlags = (response.content.match(/\[VERIFY\]/g) || []).length
        judgmentFlags = (response.content.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length

        await prisma.aITask.update({
          where: { id: aiTask.id },
          data: {
            status: "READY_FOR_REVIEW",
            tokenizedInput: tokenizedText.substring(0, 10000),
            tokenizedOutput: response.content,
            detokenizedOutput: detokenized,
            modelUsed: response.model,
            temperature,
            systemPromptVersion: promptName,
            verifyFlagCount: verifyFlags,
            judgmentFlagCount: judgmentFlags,
          },
        })

        await logAIRequest({
          aiTaskId: aiTask.id,
          practitionerId: (session.user as any).id,
          caseId,
          model: response.model,
          requestId: response.requestId,
          systemPromptVersion: promptName,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        })

        return NextResponse.json({
          taskId: aiTask.id,
          status: "READY_FOR_REVIEW",
          verifyFlagCount: verifyFlags,
          judgmentFlagCount: judgmentFlags,
          warning: "AI did not return structured data. Output saved as narrative text for review.",
        })
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

      // Merge with template — this computes all formulas
      const merged = mergeTemplateWithData(detokenizedData)

      // Log merge results
      console.log(`[AI Analyze] Merge complete: ${merged.tabs.length} tabs, ${merged.validationIssues.length} validation issues`)
      console.log(`[AI Analyze] Summary: assets=$${merged.summary.totalAssetEquity}, income=$${merged.summary.monthlyNetIncome}, RCP lump=$${merged.summary.rcpLump}, liability=$${merged.summary.totalLiability}`)
      console.log(`[AI Analyze] Arrays: ${merged.extractedArrays.tax_liability.length} tax periods, ${merged.extractedArrays.bank_accounts.length} bank accounts, ${merged.extractedArrays.dependents.length} dependents`)
      if (merged.validationIssues.length > 0) {
        console.log(`[AI Analyze] Validation issues:`, merged.validationIssues.map(i => `${i.severity}: ${i.label} - ${i.issue}`).join("; "))
      }

      // Store both the raw extracted JSON and the merged result
      detokenized = JSON.stringify({
        _type: "oic_working_papers_v1",
        extracted: detokenizedData,
        merged: merged,
      })

      // Count flags from validation
      verifyFlags = merged.validationIssues.filter(i => i.severity === "warning").length +
        (detokenizedData.verify_flags?.length || 0)
      judgmentFlags = (detokenizedData.practitioner_judgment_items?.length || 0)

    } else {
      // --- NARRATIVE PIPELINE (unchanged) ---
      detokenized = detokenizeText(response.content, tokenMap)
      verifyFlags = (response.content.match(/\[VERIFY\]/g) || []).length
      judgmentFlags = (response.content.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length
    }

    // Update AI task with results
    await prisma.aITask.update({
      where: { id: aiTask.id },
      data: {
        status: "READY_FOR_REVIEW",
        tokenizedInput: tokenizedText.substring(0, 10000),
        tokenizedOutput: response.content,
        detokenizedOutput: detokenized,
        modelUsed: response.model,
        temperature,
        systemPromptVersion: promptName,
        verifyFlagCount: verifyFlags,
        judgmentFlagCount: judgmentFlags,
      },
    })

    // Audit log
    await logAIRequest({
      aiTaskId: aiTask.id,
      practitionerId: (session.user as any).id,
      caseId,
      model: response.model,
      requestId: response.requestId,
      systemPromptVersion: promptName,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    })

    return NextResponse.json({
      taskId: aiTask.id,
      status: "READY_FOR_REVIEW",
      verifyFlagCount: verifyFlags,
      judgmentFlagCount: judgmentFlags,
    })
  } catch (error: any) {
    console.error("AI analysis error:", error)

    if (aiTaskId) {
      await prisma.aITask.update({
        where: { id: aiTaskId },
        data: { status: "REJECTED" },
      }).catch((e) => console.error("Failed to update task status:", e))
    }

    if (error?.status === 401) {
      return NextResponse.json(
        { error: "Invalid API key. Please check your ANTHROPIC_API_KEY configuration." },
        { status: 502 }
      )
    }
    if (error?.status === 429) {
      return NextResponse.json(
        { error: "AI service rate limit exceeded. Please try again in a moment." },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { error: error.message || "AI analysis failed" },
      { status: 500 }
    )
  }
}
