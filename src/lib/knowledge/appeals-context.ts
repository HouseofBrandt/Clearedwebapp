import { searchKnowledge } from "./search"

export async function getAppealsContext(
  documentText: string,
  caseType: string,
  additionalContext?: string
): Promise<string> {
  const issues = detectRejectionIssues(documentText)

  if (issues.length === 0) {
    const results = await searchKnowledge(
      "OIC rejection rebuttal appeals IRC 7122 RCP",
      { topK: 8, minScore: 0.2 }
    )
    return formatResults(results, [])
  }

  const allResults: Map<string, any> = new Map()
  const issueLabels: string[] = []

  for (const issue of issues) {
    issueLabels.push(issue.label)
    try {
      const results = await searchKnowledge(issue.searchQuery, { topK: 4, minScore: 0.2 })
      for (const r of results) {
        const existing = allResults.get(r.chunkId)
        if (!existing || r.score > existing.score) {
          allResults.set(r.chunkId, { ...r, matchedIssue: issue.label })
        }
      }
    } catch {
      // Individual search failed — continue with others
    }
  }

  // General appeals procedure
  try {
    const procedural = await searchKnowledge(
      "appeals rebuttal template procedure Form 13711 independent review",
      { topK: 3, minScore: 0.2 }
    )
    for (const r of procedural) {
      if (!allResults.has(r.chunkId)) {
        allResults.set(r.chunkId, { ...r, matchedIssue: "Appeals Procedure" })
      }
    }
  } catch {}

  // Case law
  try {
    const caseLaw = await searchKnowledge(
      "Tax Court OIC abuse discretion Speltz case law rebuttal",
      { topK: 3, minScore: 0.2 }
    )
    for (const r of caseLaw) {
      if (!allResults.has(r.chunkId)) {
        allResults.set(r.chunkId, { ...r, matchedIssue: "Case Law" })
      }
    }
  } catch {}

  const sorted = Array.from(allResults.values()).sort((a, b) => b.score - a.score)
  return formatResults(sorted, issueLabels)
}

interface RejectionIssue {
  label: string
  searchQuery: string
}

function detectRejectionIssues(text: string): RejectionIssue[] {
  const t = text.toLowerCase()
  const issues: RejectionIssue[] = []

  if (t.match(/reasonable collection potential|rcp|offer.*(?:less|below|lower).*(?:rcp|potential)|amount.*insufficient/)) {
    issues.push({
      label: "RCP Calculation Dispute",
      searchQuery: "RCP reasonable collection potential calculation methodology future income multiplier",
    })
  }

  if (t.match(/asset.*(?:value|valuation|equity)|quick sale|qsv|fair market|fmv|property.*(?:value|equity)|home.*equity/)) {
    issues.push({
      label: "Asset Valuation",
      searchQuery: "asset valuation QSV quick sale value real property retirement vehicle equity calculation",
    })
  }

  if (t.match(/dissipat|transfer.*(?:asset|property)|below.*(?:fair market|fmv)|related.*party/)) {
    issues.push({
      label: "Dissipated Assets",
      searchQuery: "dissipated asset transfer below FMV related party lookback IRM 5.8.4.3",
    })
  }

  if (t.match(/(?:expense|expenditure).*(?:exceed|above|disallow)|national standard|local standard|allowable.*expense|housing.*(?:cost|standard)|transportation/)) {
    issues.push({
      label: "Expense Allowance",
      searchQuery: "expense allowance national standards local standards above-standard housing healthcare conditional IRM 5.15",
    })
  }

  if (t.match(/future income|income.*(?:multiplier|potential)|earning.*(?:capacity|potential)|disposable income|monthly.*income/)) {
    issues.push({
      label: "Future Income",
      searchQuery: "future income multiplier MDI monthly disposable income declining seasonal IRM 5.8.5.3",
    })
  }

  if (t.match(/retirement|401k|401\(k\)|ira|pension|sep|403b|early withdrawal/)) {
    issues.push({
      label: "Retirement Accounts",
      searchQuery: "retirement account 401k IRA OIC valuation early withdrawal penalty tax deduction IRC 72(t)",
    })
  }

  if (t.match(/(?:filing|return).*(?:compliance|delinquent|unfiled)|not.*(?:filed|current)|processability/)) {
    issues.push({
      label: "Filing Compliance",
      searchQuery: "filing compliance unfiled returns delinquent processability IRM 5.8.3.7",
    })
  }

  if (t.match(/(?:payment|deposit).*compliance|estimated tax|current.*(?:obligation|payment)/)) {
    issues.push({
      label: "Payment Compliance",
      searchQuery: "payment compliance estimated tax federal tax deposit current obligations IRM 5.8.3",
    })
  }

  if (t.match(/effective tax admin|eta|hardship|economic hardship|inequitable|exceptional circumstance/)) {
    issues.push({
      label: "ETA / Hardship",
      searchQuery: "effective tax administration ETA economic hardship inequitable Treas Reg 301.7122-1(b)(3) IRM 5.8.11",
    })
  }

  if (t.match(/csed|collection statute|statute.*(?:expir|limit)|10.year|remaining.*(?:collection|time)/)) {
    issues.push({
      label: "CSED / Collection Window",
      searchQuery: "CSED collection statute expiration tolling remaining collection window IRC 6502",
    })
  }

  if (t.match(/doubt.*liability|datl|liability.*(?:dispute|incorrect|wrong)|assessment.*(?:error|incorrect)/)) {
    issues.push({
      label: "Liability Dispute",
      searchQuery: "doubt as to liability DATL assessment error substitute for return SFR IRC 7122",
    })
  }

  if (t.match(/penalty|first time abatement|fta|reasonable cause|failure to (?:file|pay)/)) {
    issues.push({
      label: "Penalty Issues",
      searchQuery: "penalty abatement FTA reasonable cause failure to file pay IRC 6651 IRM 20.1.1",
    })
  }

  if (t.match(/(?:business|self.employ).*income|schedule c|net.*(?:profit|income)|owner.*draw/)) {
    issues.push({
      label: "Business Income",
      searchQuery: "self-employment business income Schedule C net profit owner draw IRM 5.8.5.3.1",
    })
  }

  if (t.match(/innocent spouse|separation of liability|equitable relief|6015/)) {
    issues.push({
      label: "Innocent Spouse",
      searchQuery: "innocent spouse IRC 6015 equitable relief separation liability Rev Proc 2013-34",
    })
  }

  return issues
}

function formatResults(results: any[], issueLabels: string[]): string {
  if (results.length === 0) return ""

  let context = "\n\n--- FIRM KNOWLEDGE BASE: APPEALS REBUTTAL MATERIAL ---\n"
  if (issueLabels.length > 0) {
    context += `Rejection issues identified: ${issueLabels.join(", ")}\n`
    context += "The following excerpts were retrieved with targeted searches for each issue.\n\n"
  } else {
    context += "General appeals rebuttal reference material.\n\n"
  }

  let totalTokens = 0
  const MAX_TOKENS = 6000

  for (const r of results) {
    const chunkTokens = Math.ceil(r.content.length / 4)
    if (totalTokens + chunkTokens > MAX_TOKENS) break

    context += `[Source: ${r.documentTitle}`
    if (r.sectionHeader) context += ` — ${r.sectionHeader}`
    context += ` | ${r.documentCategory}`
    if (r.matchedIssue) context += ` | Matched: ${r.matchedIssue}`
    context += `]\n`
    context += `${r.content}\n\n`
    totalTokens += chunkTokens
  }

  context += "--- END APPEALS REBUTTAL MATERIAL ---\n"
  context += "Use the above material to support each rebuttal point. "
  context += "Cite the specific IRM sections, IRC provisions, and Treas. Reg. "
  context += "references from the retrieved material. When the knowledge base "
  context += "provides a rebuttal strategy for a specific issue (e.g., expense "
  context += "allowance, asset valuation), follow that strategy framework.\n"

  return context
}
