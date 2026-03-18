import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText } from "@/lib/ai/tokenizer"
import { logAIRequest } from "@/lib/ai/audit"
import { loadPrompt } from "@/lib/ai/prompts"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"
import { z } from "zod"

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

    const documentText = caseData.documents
      .map((d) => `--- ${d.fileName} (${d.documentCategory}) ---\n${d.extractedText}`)
      .join("\n\n")

    if (!documentText.trim()) {
      return NextResponse.json(
        { error: "No extracted text found in case documents. Upload and process documents first." },
        { status: 400 }
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

    // Tokenize PII
    const knownNames = [caseData.clientName]
    const fullText = additionalContext
      ? `${documentText}\n\n${additionalContext}`
      : documentText
    const { tokenizedText, tokenMap } = tokenizeText(fullText, knownNames)

    const tokenizedDocText = additionalContext
      ? tokenizedText.substring(0, tokenizedText.length - additionalContext.length - 2)
      : tokenizedText
    const tokenizedContext = additionalContext
      ? tokenizeText(additionalContext, knownNames).tokenizedText
      : undefined

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

    // Use sonnet for extraction (reliable, fast), opus for complex narrative
    const isTemplateTask = TEMPLATE_TASKS.includes(taskType)
    const model = isTemplateTask
      ? "claude-sonnet-4-6"   // Extraction is simpler — sonnet is reliable and cheaper
      : taskType === "OIC_NARRATIVE" ? "claude-opus-4-6" : "claude-sonnet-4-6"
    const maxTokens = isTemplateTask ? 4096 : 8192
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

    if (isTemplateTask) {
      // --- TEMPLATE + EXTRACTION PIPELINE ---
      // Parse the JSON extraction response
      let extractedData: Record<string, any>
      try {
        // Strip markdown code fences if present
        let jsonStr = response.content.trim()
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
        }
        extractedData = JSON.parse(jsonStr)
      } catch (parseError) {
        console.error("Failed to parse extraction JSON:", parseError)
        console.error("Raw response:", response.content.substring(0, 500))
        throw new Error("AI returned invalid JSON for data extraction. Please try again.")
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
