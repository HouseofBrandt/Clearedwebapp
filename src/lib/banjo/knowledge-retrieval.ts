import { searchKnowledge, type SearchResult } from "@/lib/knowledge/search"

/**
 * Deep, multi-query KB retrieval for Banjo deliverables.
 * Runs parallel searches across multiple dimensions of the assignment
 * and deduplicates results. No artificial token cap.
 */
export async function getBanjoKnowledgeContext(params: {
  assignmentText: string
  taskType: string
  caseType: string
  casePosture?: any
  caseIntelligence?: any
  documentCategories: string[]
  priorDeliverableContext?: string
}): Promise<string> {
  const queries: Array<{ query: string; topK: number; label: string; categoryFilter?: string[] }> = []

  // Query 1: Task-type-specific search (enhanced)
  queries.push({
    query: buildTaskQuery(params.taskType, params.caseType),
    topK: 5,
    label: "Task-specific guidance",
  })

  // Query 2: Assignment-specific search (uses practitioner's actual words)
  if (params.assignmentText) {
    queries.push({
      query: params.assignmentText.substring(0, 500),
      topK: 5,
      label: "Assignment-specific material",
    })
  }

  // Query 3: Case posture search (procedural context)
  if (params.casePosture?.collectionStage) {
    queries.push({
      query: `${params.caseType} ${params.casePosture.collectionStage} ${params.casePosture.reliefSought || ""}`,
      topK: 3,
      label: "Procedural guidance",
    })
  }

  // Query 4: Risk/edge case search
  const riskTerms = extractRiskSearchTerms(params.caseIntelligence)
  if (riskTerms) {
    queries.push({
      query: riskTerms,
      topK: 3,
      label: "Risk-relevant material",
    })
  }

  // Query 5: Prior approved work product for this case type
  queries.push({
    query: `${params.caseType} approved work product analysis`,
    topK: 3,
    label: "Prior approved outputs",
    categoryFilter: ["APPROVED_OUTPUT"],
  })

  // Run all queries in parallel
  const allResults = await runParallelSearches(queries)
  const deduplicated = deduplicateByChunkId(allResults)

  if (deduplicated.length === 0) return ""

  return formatKnowledgeContext(deduplicated)
}

/**
 * Get KB coverage stats for a case type (used by orchestrator).
 */
export async function getKBCoverage(caseType: string): Promise<{
  relevantCount: number
  approvedOutputCount: number
  categoriesPresent: string[]
  categoriesMissing: string[]
  lastUpdated: string
}> {
  const { prisma } = await import("@/lib/db")

  const results = await searchKnowledge(caseType, { topK: 50, minScore: 0.15 })
  const approvedOutputs = results.filter((r) => r.documentCategory === "APPROVED_OUTPUT")

  const categoriesPresent = Array.from(new Set(results.map((r) => r.documentCategory)))
  const allCategories = ["IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE", "CASE_LAW", "APPROVED_OUTPUT", "FIRM_PROCEDURE"]
  const categoriesMissing = allCategories.filter((c) => !categoriesPresent.includes(c))

  // Find most recent KB update for this case type
  const latestDoc = await prisma.knowledgeDocument.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  })

  return {
    relevantCount: results.length,
    approvedOutputCount: approvedOutputs.length,
    categoriesPresent,
    categoriesMissing,
    lastUpdated: latestDoc?.updatedAt?.toISOString() || "Never",
  }
}

function buildTaskQuery(taskType: string, caseType: string): string {
  const taskTerms: Record<string, string> = {
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
    CASE_SUMMARY: "case summary risk assessment resolution strategy",
    RISK_ASSESSMENT: "risk analysis missing documents procedural risks",
  }

  const caseTerms: Record<string, string> = {
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

  return `${taskTerms[taskType] || taskType} ${caseTerms[caseType] || caseType}`
}

function extractRiskSearchTerms(intelligence: any): string | null {
  if (!intelligence) return null

  const terms: string[] = []
  if (intelligence.csedEarliest) terms.push("CSED collection statute expiration tolling")
  if (intelligence.levyThreatActive) terms.push("levy release emergency")
  if (intelligence.liensFiledActive) terms.push("lien subordination discharge")
  if (!intelligence.allReturnsFiled) terms.push("unfiled returns compliance requirement")
  if (!intelligence.poaOnFile) terms.push("power of attorney form 2848")

  return terms.length > 0 ? terms.join(" ") : null
}

async function runParallelSearches(
  queries: Array<{ query: string; topK: number; label: string; categoryFilter?: string[] }>
): Promise<Array<SearchResult & { label: string }>> {
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const searchResults = await searchKnowledge(q.query, {
        topK: q.topK,
        categoryFilter: q.categoryFilter,
        minScore: 0.2,
      })
      return searchResults.map((r) => ({ ...r, label: q.label }))
    })
  )

  const allResults: Array<SearchResult & { label: string }> = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value)
    }
  }
  return allResults
}

function deduplicateByChunkId(results: Array<SearchResult & { label: string }>): Array<SearchResult & { label: string }> {
  const seen = new Set<string>()
  const deduplicated: Array<SearchResult & { label: string }> = []

  // Sort by score descending so we keep the highest-scoring version
  results.sort((a, b) => b.score - a.score)

  for (const r of results) {
    if (!seen.has(r.chunkId)) {
      seen.add(r.chunkId)
      deduplicated.push(r)
    }
  }
  return deduplicated
}

function formatKnowledgeContext(results: Array<SearchResult & { label: string }>): string {
  if (results.length === 0) return ""

  let context = "\n\n--- FIRM KNOWLEDGE BASE REFERENCE MATERIAL ---\n"
  context += "The following excerpts from the firm's knowledge base are relevant to this analysis. "
  context += "Items marked [APPROVED OUTPUT] are from prior practitioner-approved work product. "
  context += "Items marked [WEB RESEARCH] are from recent web research and should be verified. "
  context += "Items marked [MANUAL UPLOAD] are firm-curated authoritative material.\n\n"

  // Group by label for organized presentation
  const grouped = new Map<string, Array<SearchResult & { label: string }>>()
  for (const r of results) {
    const existing = grouped.get(r.label) || []
    existing.push(r)
    grouped.set(r.label, existing)
  }

  for (const [label, items] of Array.from(grouped.entries())) {
    context += `[${label}]\n`
    for (const r of items) {
      context += `[Source: ${r.documentTitle}`
      if (r.sectionHeader) context += ` \u2014 ${r.sectionHeader}`
      context += ` | ${r.documentCategory}]\n`
      context += `${r.content}\n\n`
    }
  }

  context += "--- END KNOWLEDGE BASE MATERIAL ---\n"
  return context
}
