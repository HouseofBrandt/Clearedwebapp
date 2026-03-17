import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { tokenizeText, encryptTokenMap, detokenizeText } from "@/lib/ai/tokenizer"
import { logAIRequest } from "@/lib/ai/audit"
import { readFileSync } from "fs"
import path from "path"

// Force Next.js to include prompt files in the serverless bundle
// by referencing the directory with path.join at module level
const PROMPTS_DIR = path.join(process.cwd(), "src", "lib", "ai", "prompts")

function loadPrompt(name: string): string {
  const promptPath = path.join(PROMPTS_DIR, `${name}.txt`)
  return readFileSync(promptPath, "utf-8")
}

const TASK_TYPE_TO_PROMPT: Record<string, string> = {
  WORKING_PAPERS: "oic_analysis_v1",
  CASE_MEMO: "case_analysis_v1",
  PENALTY_LETTER: "penalty_abatement_v1",
  OIC_NARRATIVE: "oic_analysis_v1",
  GENERAL_ANALYSIS: "case_analysis_v1",
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { caseId, taskType, additionalContext } = body

    if (!caseId || !taskType) {
      return NextResponse.json(
        { error: "caseId and taskType are required" },
        { status: 400 }
      )
    }

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

    // Combine all extracted text from documents
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
        taskType: taskType as any,
        status: "PROCESSING",
        createdById: (session.user as any).id,
      },
    })

    // Tokenize PII
    const knownNames = [caseData.clientName]
    const { tokenizedText, tokenMap } = tokenizeText(documentText, knownNames)

    // Store encrypted token map
    const encryptedMap = encryptTokenMap(tokenMap)
    await prisma.tokenMap.create({
      data: {
        caseId,
        tokenMap: encryptedMap,
      },
    })

    // Load system prompts
    const corePrompt = loadPrompt("core_system_v1")
    const promptName = TASK_TYPE_TO_PROMPT[taskType] || "case_analysis_v1"
    const taskPrompt = loadPrompt(promptName)
    const systemPrompt = `${corePrompt}\n\n${taskPrompt}`

    // Build user message
    let userMessage = `Case Type: ${caseData.caseType}\nCase Number: ${caseData.caseNumber}\n\n`
    userMessage += `Documents:\n${tokenizedText}`
    if (additionalContext) {
      userMessage += `\n\nAdditional Context:\n${additionalContext}`
    }

    // Determine model based on complexity
    const useOpus = taskType === "WORKING_PAPERS" || taskType === "OIC_NARRATIVE"
    const model = useOpus ? "claude-opus-4-6" : "claude-sonnet-4-6"

    // Call Claude API
    const response = await callClaude({
      systemPrompt,
      userMessage,
      model,
      temperature: 0.2,
      maxTokens: 8192,
    })

    // Count flags
    const verifyFlags = (response.content.match(/\[VERIFY\]/g) || []).length
    const judgmentFlags = (response.content.match(/\[PRACTITIONER JUDGMENT\]/g) || []).length

    // Detokenize for practitioner review
    const detokenized = detokenizeText(response.content, tokenMap)

    // Update AI task
    await prisma.aITask.update({
      where: { id: aiTask.id },
      data: {
        status: "READY_FOR_REVIEW",
        tokenizedInput: tokenizedText.substring(0, 10000),
        tokenizedOutput: response.content,
        detokenizedOutput: detokenized,
        modelUsed: response.model,
        temperature: 0.2,
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
    return NextResponse.json(
      { error: error.message || "AI analysis failed" },
      { status: 500 }
    )
  }
}
