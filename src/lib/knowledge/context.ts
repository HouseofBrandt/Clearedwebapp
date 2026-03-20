import { searchKnowledge } from "./search"

/**
 * Build a knowledge base context block for injection into
 * any AI system prompt. Searches for relevant material
 * based on the task type and document content.
 */
export async function getKnowledgeContext(
  taskType: string,
  caseType: string,
  documentPreview: string,
  additionalContext?: string
): Promise<string> {
  const queryParts: string[] = []

  const taskSearchTerms: Record<string, string> = {
    GENERAL_ANALYSIS: "tax resolution analysis strategy",
    WORKING_PAPERS: "OIC working papers Form 433-A RCP calculation",
    OIC_NARRATIVE: "offer in compromise narrative reasonable collection potential",
    CASE_MEMO: "case memo analysis resolution options",
    PENALTY_LETTER: "penalty abatement reasonable cause first time abatement",
    IA_ANALYSIS: "installment agreement partial pay PPIA",
    CNC_ANALYSIS: "currently not collectible hardship",
    TFRP_ANALYSIS: "trust fund recovery penalty responsible person willfulness",
    INNOCENT_SPOUSE_ANALYSIS: "innocent spouse relief IRC 6015",
    APPEALS_REBUTTAL: "OIC rejection rebuttal appeals",
  }

  const caseSearchTerms: Record<string, string> = {
    OIC: "offer in compromise",
    IA: "installment agreement",
    PENALTY: "penalty abatement",
    CNC: "currently not collectible",
    TFRP: "trust fund recovery penalty",
    INNOCENT_SPOUSE: "innocent spouse",
    CDP: "collection due process hearing",
    ERC: "employee retention credit",
    AUDIT: "audit examination",
    UNFILED: "unfiled returns compliance",
  }

  queryParts.push(taskSearchTerms[taskType] || taskType)
  queryParts.push(caseSearchTerms[caseType] || caseType)

  // Extract IRC/IRM references from document preview
  const ircMatches = documentPreview.match(/IRC\s*§?\s*\d+/gi)
  if (ircMatches) queryParts.push(...ircMatches.slice(0, 3))

  const irmMatches = documentPreview.match(/IRM\s*[\d.]+/gi)
  if (irmMatches) queryParts.push(...irmMatches.slice(0, 3))

  if (additionalContext) {
    queryParts.push(additionalContext.substring(0, 200))
  }

  const searchQuery = queryParts.join(" ")

  let results
  try {
    results = await searchKnowledge(searchQuery, { topK: 8, minScore: 0.25 })
  } catch (error: any) {
    console.error("[Knowledge] Search failed:", error.message)
    return ""
  }

  if (results.length === 0) return ""

  let context = "\n\n--- FIRM KNOWLEDGE BASE REFERENCE MATERIAL ---\n"
  context +=
    "The following excerpts from the firm's knowledge base are relevant to this analysis. " +
    "Incorporate this guidance where applicable. When citing firm-specific procedures or " +
    "prior work product, note the source.\n\n"

  let totalTokens = 0
  const MAX_CONTEXT_TOKENS = 4000

  for (const r of results) {
    const chunkTokens = Math.ceil(r.content.length / 4)
    if (totalTokens + chunkTokens > MAX_CONTEXT_TOKENS) break

    context += `[Source: ${r.documentTitle}`
    if (r.sectionHeader) context += ` — ${r.sectionHeader}`
    context += ` | ${r.documentCategory}]\n`
    context += `${r.content}\n\n`
    totalTokens += chunkTokens
  }

  context += "--- END KNOWLEDGE BASE MATERIAL ---\n"

  return context
}
