import { callClaude } from "./client"

const CASE_ROUTER_PROMPT = `You are a tax resolution case classifier. Based on the provided document text, classify the case into one of the following types:

- OIC: Offer in Compromise - taxpayer requesting to settle tax debt for less than owed
- IA: Installment Agreement - taxpayer requesting payment plan
- PENALTY: Penalty Abatement - requesting removal of penalties
- INNOCENT_SPOUSE: Innocent Spouse Relief under IRC § 6015
- CNC: Currently Not Collectible - taxpayer cannot afford to pay
- TFRP: Trust Fund Recovery Penalty under § 6672
- ERC: Employee Retention Credit claims
- UNFILED: Unfiled tax returns
- AUDIT: Audit representation
- CDP: Collection Due Process hearing
- OTHER: Does not clearly fit any specific category

Respond with ONLY the case type code (e.g., "OIC") and a brief one-sentence explanation.
Format: TYPE: explanation`

export async function classifyCaseType(documentText: string): Promise<{
  caseType: string
  explanation: string
}> {
  const response = await callClaude({
    systemPrompt: CASE_ROUTER_PROMPT,
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
