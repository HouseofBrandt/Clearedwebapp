import { callClaude } from "./client"
import { loadPrompt } from "./prompts"

export async function classifyCaseType(documentText: string): Promise<{
  caseType: string
  explanation: string
}> {
  const routerPrompt = loadPrompt("case_router_v1")
  const response = await callClaude({
    systemPrompt: routerPrompt,
    userMessage: documentText.substring(0, 8000), // Limit input size
    temperature: 0.1,
    maxTokens: 200,
  })

  const content = response.content.trim()
  const colonIndex = content.indexOf(":")
  if (colonIndex > 0) {
    const caseType = content.substring(0, colonIndex).trim().toUpperCase()
    const explanation = content.substring(colonIndex + 1).trim()

    const validTypes = [
      "OIC", "IA", "PENALTY", "INNOCENT_SPOUSE", "CNC",
      "TFRP", "ERC", "UNFILED", "AUDIT", "CDP", "OTHER",
    ]
    if (validTypes.includes(caseType)) {
      return { caseType, explanation }
    }
  }

  return { caseType: "OTHER", explanation: content }
}
