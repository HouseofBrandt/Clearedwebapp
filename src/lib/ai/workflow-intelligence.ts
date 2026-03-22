import { formatDate } from "@/lib/date-utils"

// ──────────────────────────────────────────────────
// REQUIRED DOCUMENTS BY CASE TYPE
// ──────────────────────────────────────────────────
export const REQUIRED_DOCS: Record<string, Array<{
  category: string
  label: string
  critical: boolean
  minCount?: number
}>> = {
  OIC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts (all open years)", critical: true },
    { category: "BANK_STATEMENT", label: "Personal bank statements (3 consecutive months)", critical: true, minCount: 3 },
    { category: "BANK_STATEMENT", label: "Business bank statements (3 consecutive months)", critical: true, minCount: 3 },
    { category: "PAY_STUB", label: "Pay stubs or income documentation (2 months)", critical: true, minCount: 2 },
    { category: "TAX_RETURN", label: "Tax returns for all open years", critical: true },
    { category: "MORTGAGE_STATEMENT", label: "Mortgage statement(s) for all properties", critical: true },
    { category: "INSURANCE", label: "Health insurance documentation", critical: true },
    { category: "RETIREMENT_ACCOUNT", label: "Retirement account statements (all accounts)", critical: true },
    { category: "VEHICLE_LOAN", label: "Vehicle loan/title statements", critical: false },
    { category: "STUDENT_LOAN", label: "Student loan statements", critical: false },
    { category: "UTILITY_BILL", label: "Utility bills (1-3 months)", critical: false },
    { category: "MEETING_NOTES", label: "Client intake notes", critical: false },
  ],
  IA: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts", critical: true },
    { category: "BANK_STATEMENT", label: "Bank statements (3 months)", critical: true, minCount: 3 },
    { category: "PAY_STUB", label: "Income documentation", critical: true },
    { category: "MORTGAGE_STATEMENT", label: "Mortgage/rent documentation", critical: false },
    { category: "INSURANCE", label: "Health insurance", critical: false },
  ],
  PENALTY: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts (penalty years + 3 prior for FTA)", critical: true },
    { category: "IRS_NOTICE", label: "IRS penalty/collection notices", critical: true },
  ],
  CNC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts", critical: true },
    { category: "BANK_STATEMENT", label: "Bank statements (3 months)", critical: true, minCount: 3 },
    { category: "PAY_STUB", label: "Income documentation", critical: true },
    { category: "INSURANCE", label: "Health insurance", critical: true },
    { category: "MEDICAL", label: "Medical records (if hardship basis)", critical: false },
  ],
  TFRP: [
    { category: "IRS_NOTICE", label: "Business transcripts (Form 941 quarters)", critical: true },
    { category: "IRS_NOTICE", label: "Letter 1153 or TFRP assessment notice", critical: true },
    { category: "BANK_STATEMENT", label: "Business bank statements", critical: true },
  ],
  INNOCENT_SPOUSE: [
    { category: "TAX_RETURN", label: "Joint tax returns for all periods at issue", critical: true },
    { category: "IRS_NOTICE", label: "IRS deficiency or collection notices", critical: true },
    { category: "BANK_STATEMENT", label: "Separate bank statements (requesting spouse)", critical: false },
  ],
  CDP: [
    { category: "IRS_NOTICE", label: "LT11/Letter 1058 (triggering notice)", critical: true },
    { category: "IRS_NOTICE", label: "Account transcripts for all periods", critical: true },
  ],
}

// ──────────────────────────────────────────────────
// DEADLINE CONSEQUENCES
// ──────────────────────────────────────────────────
export const DEADLINE_CONSEQUENCES: Record<string, string> = {
  CDP_HEARING: "IRREVERSIBLE — Missing the 30-day CDP deadline means losing Tax Court jurisdiction under IRC § 6330. Only an Equivalent Hearing (no judicial review) remains. The IRS can proceed with levy action.",
  EQUIVALENT_HEARING: "Missing the Equivalent Hearing request deadline eliminates the last administrative avenue to challenge the levy before it happens. File immediately.",
  TAX_COURT_PETITION: "IRREVERSIBLE — Missing the 90-day Tax Court petition deadline means the deficiency becomes assessed and collectible. The only remaining option is to pay the full amount and sue for refund in District Court or Court of Federal Claims.",
  CSED_EXPIRATION: "FAVORABLE — When the CSED expires, the IRS can no longer collect the liability. However, verify no tolling events extend the date. Filing an OIC tolls the CSED per IRC § 6331(k)(1).",
  OIC_SUBMISSION: "Interest and penalties continue accruing every day the OIC is not filed. If an Equivalent Hearing is pending, the hearing may proceed without the OIC in hand.",
  OIC_PAYMENT: "Missing an OIC payment deadline after acceptance can DEFAULT the agreement under IRC § 7122(c)(1). The IRS reinstates the FULL original liability minus amounts paid. This is catastrophic.",
  OIC_COMPLIANCE: "During the 5-year OIC compliance period, the taxpayer must file all returns on time and pay all taxes. Non-compliance DEFAULTS the OIC and reinstates the full original liability.",
  IA_PAYMENT: "Missing an IA payment triggers a CP523 default notice. The IRS can resume full collection action including levy. The taxpayer gets 30 days to cure the default.",
  RETURN_DUE: "Late filing triggers the failure-to-file penalty of 5% per month (max 25%) under IRC § 6651(a)(1). For OIC cases, all returns must be filed for processability per IRM 5.8.3.7.",
  EXTENSION_DUE: "Missing the extension deadline means the return is late. File the extension even if you can't file the return — it avoids the FTF penalty.",
  ESTIMATED_TAX: "Missing estimated tax payments triggers the underpayment penalty under IRC § 6654. For OIC cases, current compliance is required — missed estimates make the offer non-processable.",
  POA_RENEWAL: "An expired POA means the IRS will not communicate with the practitioner. File a new Form 2848 immediately.",
  IRS_RESPONSE: "Failing to respond to an IRS information request can result in the IRS making a determination based on available information only — which is almost always unfavorable.",
  DOCUMENT_REQUEST: "Missing a document request deadline from the IRS can result in case closure, offer return, or adverse determination. Always respond even if you need more time — request an extension in writing.",
}

// ──────────────────────────────────────────────────
// NEXT STEP RECOMMENDATIONS
// ──────────────────────────────────────────────────
export interface WorkflowStep {
  priority: "CRITICAL" | "HIGH" | "NORMAL"
  action: string
  reason: string
}

export function getNextSteps(caseData: any): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const now = new Date()

  const docCategories = new Set(
    caseData.documents?.map((d: any) => d.documentCategory) || []
  )
  const docCategoryCounts: Record<string, number> = {}
  for (const d of caseData.documents || []) {
    docCategoryCounts[d.documentCategory] = (docCategoryCounts[d.documentCategory] || 0) + 1
  }
  const taskTypes = new Set(
    caseData.aiTasks?.map((t: any) => t.taskType) || []
  )
  const taskStatuses: Record<string, string> = {}
  for (const t of caseData.aiTasks || []) {
    taskStatuses[t.taskType] = t.status
  }
  const hasPendingReview = caseData.aiTasks?.some(
    (t: any) => t.status === "READY_FOR_REVIEW"
  )

  // ── Urgent deadlines first ──
  for (const d of caseData.deadlines || []) {
    const dueDate = new Date(d.dueDate)
    const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / 86400000)
    if (daysUntil <= 7 && daysUntil >= 0 && d.status === "UPCOMING") {
      steps.push({
        priority: "CRITICAL",
        action: `DEADLINE: ${d.title} due in ${daysUntil} day(s) (${formatDate(dueDate)})`,
        reason: DEADLINE_CONSEQUENCES[d.type] || "Ensure all required actions are completed before this date.",
      })
    }
  }

  // ── Overdue deadlines ──
  for (const d of caseData.deadlines || []) {
    const dueDate = new Date(d.dueDate)
    if (dueDate < now && d.status === "UPCOMING") {
      const daysOver = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
      steps.push({
        priority: "CRITICAL",
        action: `OVERDUE: ${d.title} was due ${daysOver} day(s) ago`,
        reason: "Address this immediately. Check if the deadline can still be met or if alternative remedies are available.",
      })
    }
  }

  // ── Pending reviews block everything ──
  if (hasPendingReview) {
    const pendingCount = caseData.aiTasks?.filter((t: any) => t.status === "READY_FOR_REVIEW").length || 0
    steps.push({
      priority: "HIGH",
      action: `Review ${pendingCount} pending AI output(s) in the Review Queue`,
      reason: "No AI output can become a deliverable until reviewed and approved. This blocks downstream work.",
    })
  }

  // ── INTAKE stage logic ──
  if (caseData.status === "INTAKE") {
    if (!docCategories.has("IRS_NOTICE")) {
      steps.push({
        priority: "HIGH",
        action: "Pull IRS account transcripts (IMFOLT) for all tax years",
        reason: "Transcripts are the foundation. Without them you cannot determine total liability, CSEDs, penalty exposure, or filing compliance. Request via CAF unit or e-Services.",
      })
    }

    if (caseData.documents?.length === 0) {
      steps.push({
        priority: "HIGH",
        action: "Upload client documents to the case",
        reason: "No documents have been uploaded. Collect bank statements (3 months personal + business), pay stubs, mortgage/rent docs, insurance, retirement statements, and vehicle loan statements.",
      })
    }

    if (caseData.documents?.length >= 3 && !taskTypes.has("GENERAL_ANALYSIS")) {
      steps.push({
        priority: "NORMAL",
        action: "Run General Analysis to identify key issues and recommended strategy",
        reason: `You have ${caseData.documents.length} documents uploaded. General Analysis will synthesize them into a case snapshot, critical findings, and resolution recommendations.`,
      })
    }
  }

  // ── Post-analysis stage logic ──
  if (taskTypes.has("GENERAL_ANALYSIS") && taskStatuses["GENERAL_ANALYSIS"] === "APPROVED") {
    // OIC-specific workflow
    if (caseData.caseType === "OIC") {
      if (!taskTypes.has("WORKING_PAPERS")) {
        steps.push({
          priority: "NORMAL",
          action: "Run OIC Working Papers to generate Form 433-A/B extraction with RCP calculation",
          reason: "Working Papers produce the structured financial analysis and RCP computation. This is required before filing Form 656.",
        })
      }
      if (taskStatuses["WORKING_PAPERS"] === "APPROVED" && !taskTypes.has("OIC_NARRATIVE")) {
        steps.push({
          priority: "NORMAL",
          action: "Run OIC Narrative to draft Section 9 of Form 656",
          reason: "The narrative tells the taxpayer's story. Run after Working Papers are approved so the narrative can reference the financial analysis.",
        })
      }
    }

    // Penalty parallel track
    if (caseData.caseType === "OIC" || caseData.caseType === "PENALTY") {
      if (!taskTypes.has("PENALTY_LETTER")) {
        steps.push({
          priority: "NORMAL",
          action: "Run Penalty Abatement Letter analysis",
          reason: "Evaluate FTA eligibility (IRM 20.1.1.3.6.1) and reasonable cause (IRC § 6651). For OIC cases, penalty abatement reduces the total liability before filing, lowering the offer floor.",
        })
      }
    }

    // TFRP
    if (caseData.caseType === "TFRP" && !taskTypes.has("TFRP_ANALYSIS")) {
      steps.push({
        priority: "HIGH",
        action: "Run TFRP Analysis to identify responsible persons and assess willfulness",
        reason: "This prepares the defense strategy and Form 4180 interview talking points. Do this before any IRS interview.",
      })
    }

    // Innocent Spouse
    if (caseData.caseType === "INNOCENT_SPOUSE" && !taskTypes.has("INNOCENT_SPOUSE_ANALYSIS")) {
      steps.push({
        priority: "HIGH",
        action: "Run Innocent Spouse Analysis (IRC § 6015 evaluation)",
        reason: "Evaluate eligibility under § 6015(b), (c), and (f). Apply Rev. Proc. 2013-34 factors. This determines which relief route to pursue.",
      })
    }

    // IA
    if (caseData.caseType === "IA" && !taskTypes.has("IA_ANALYSIS")) {
      steps.push({
        priority: "NORMAL",
        action: "Run Installment Agreement Analysis",
        reason: "Determine IA type (streamlined, non-streamlined, PPIA), minimum payment, and whether the balance can be paid before CSED.",
      })
    }

    // CNC
    if (caseData.caseType === "CNC" && !taskTypes.has("CNC_ANALYSIS")) {
      steps.push({
        priority: "NORMAL",
        action: "Run Currently Not Collectible Analysis",
        reason: "Evaluate whether expenses equal or exceed income and whether asset equity disqualifies CNC. Determine expected closing code.",
      })
    }
  }

  // ── Missing critical documents (always check) ──
  const required = REQUIRED_DOCS[caseData.caseType] || REQUIRED_DOCS["OIC"]
  for (const req of required) {
    if (req.critical && !docCategories.has(req.category)) {
      // Don't duplicate if we already flagged "pull transcripts" above
      if (req.category === "IRS_NOTICE" && steps.some(s => s.action.includes("transcript"))) continue
      if (req.category === "BANK_STATEMENT" && steps.some(s => s.action.includes("Upload client documents"))) continue
      steps.push({
        priority: "NORMAL",
        action: `Obtain missing document: ${req.label}`,
        reason: `Required for ${caseData.caseType} filing. Not found in the current document inventory.`,
      })
    }
  }

  // ── Compliance gaps ──
  const intel = caseData.intelligence
  if (intel) {
    if (!intel.allReturnsFiled && (caseData.caseType === "OIC" || caseData.caseType === "IA")) {
      steps.push({
        priority: "HIGH",
        action: "Verify all tax returns are filed (required for processability)",
        reason: "OIC and IA require full filing compliance per IRM 5.8.3.7. Pull transcripts for all years and confirm no unfiled periods.",
      })
    }
    if (!intel.currentOnEstimates && (caseData.caseType === "OIC" || caseData.caseType === "IA")) {
      steps.push({
        priority: "HIGH",
        action: "Verify current-year estimated tax payments are adequate",
        reason: "Required for OIC/IA processability. Check that 1040-ES payments are current.",
      })
    }
    if (!intel.poaOnFile) {
      steps.push({
        priority: "NORMAL",
        action: "File Form 2848 (Power of Attorney) with the IRS",
        reason: "The IRS will not communicate with the practitioner without an active POA on file.",
      })
    }
  }

  // ── Stale case warning ──
  if (caseData.updatedAt) {
    const daysSinceUpdate = Math.floor((now.getTime() - new Date(caseData.updatedAt).getTime()) / 86400000)
    if (daysSinceUpdate > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
      steps.push({
        priority: "NORMAL",
        action: `Case has had no activity in ${daysSinceUpdate} days — review and update status`,
        reason: "Stale cases may have missed deadlines or unaddressed client needs. Verify the case is being actively worked.",
      })
    }
  }

  // Sort: CRITICAL first, then HIGH, then NORMAL
  const order = { CRITICAL: 0, HIGH: 1, NORMAL: 2 }
  steps.sort((a, b) => order[a.priority] - order[b.priority])

  return steps
}

// ──────────────────────────────────────────────────
// CASE HEALTH CHECK
// ──────────────────────────────────────────────────
export function assessCaseHealth(caseData: any): string[] {
  const issues: string[] = []
  const now = new Date()

  const docCategoryCounts: Record<string, number> = {}
  for (const d of caseData.documents || []) {
    docCategoryCounts[d.documentCategory] = (docCategoryCounts[d.documentCategory] || 0) + 1
  }

  // Missing critical documents for case type
  const required = REQUIRED_DOCS[caseData.caseType] || REQUIRED_DOCS["OIC"]
  for (const req of required) {
    if (req.critical) {
      const count = docCategoryCounts[req.category] || 0
      if (count === 0) {
        issues.push(`MISSING: ${req.label} — required for ${caseData.caseType} filing`)
      } else if (req.minCount && count < req.minCount) {
        issues.push(`INCOMPLETE: ${req.label} — have ${count}, need ${req.minCount}`)
      }
    }
  }

  // Documents uploaded but no analysis run
  if ((caseData.documents?.length || 0) > 2 && (caseData.aiTasks?.length || 0) === 0) {
    issues.push("NO ANALYSIS: Documents uploaded but no AI analysis has been run")
  }

  // Stale case
  if (caseData.updatedAt) {
    const days = Math.floor((now.getTime() - new Date(caseData.updatedAt).getTime()) / 86400000)
    if (days > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
      issues.push(`STALE: No activity in ${days} days`)
    }
  }

  // Pending reviews not completed
  const pending = (caseData.aiTasks || []).filter((t: any) => t.status === "READY_FOR_REVIEW")
  if (pending.length > 0) {
    issues.push(`${pending.length} AI output(s) awaiting review`)
  }

  // Rejected tasks not re-run
  const rejected = (caseData.aiTasks || []).filter((t: any) => t.status === "REJECTED")
  if (rejected.length > 0) {
    issues.push(`${rejected.length} rejected task(s) — re-run with corrections`)
  }

  // No deadlines on case types that always need them
  const deadlineCount = caseData.deadlines?.length || 0
  if (deadlineCount === 0) {
    if (caseData.caseType === "CDP") {
      issues.push("CRITICAL: No CDP hearing deadline set — this is the most time-sensitive deadline in tax resolution")
    } else if (caseData.caseType === "OIC") {
      issues.push("No OIC-related deadlines set — add submission target and compliance dates")
    }
  }

  // Overdue deadlines
  for (const d of caseData.deadlines || []) {
    if (new Date(d.dueDate) < now && d.status === "UPCOMING") {
      const daysOver = Math.floor((now.getTime() - new Date(d.dueDate).getTime()) / 86400000)
      issues.push(`OVERDUE: ${d.title} — ${daysOver} days past due`)
    }
  }

  // Liability not set
  if (!caseData.totalLiability || Number(caseData.totalLiability) === 0) {
    issues.push("Total liability not set — update after pulling transcripts")
  }

  // Intelligence-specific checks
  const intel = caseData.intelligence
  if (intel) {
    if (intel.levyThreatActive) issues.push("LEVY THREAT ACTIVE — prioritize protective action")
    if (intel.liensFiledActive) issues.push("Federal tax lien filed — may affect asset sales and credit")
    if (!intel.allReturnsFiled && ["OIC", "IA"].includes(caseData.caseType)) {
      issues.push("Filing compliance not verified — required for OIC/IA processability")
    }
    if (!intel.poaOnFile) issues.push("No Power of Attorney on file with IRS")
  }

  return issues
}

// ──────────────────────────────────────────────────
// DOCUMENT GAP ANALYSIS
// ──────────────────────────────────────────────────
export interface DocGapResult {
  present: Array<{ category: string; fileName: string; count: number }>
  missing: Array<{ category: string; label: string; critical: boolean }>
  completeness: number
  summary: string
}

export function analyzeDocumentGaps(caseData: any): DocGapResult {
  const docs = caseData.documents || []
  const caseType = caseData.caseType || "OIC"
  const required = REQUIRED_DOCS[caseType] || REQUIRED_DOCS["OIC"]

  // Count docs per category
  const categoryCounts: Record<string, { count: number; files: string[] }> = {}
  for (const d of docs) {
    const cat = d.documentCategory || "OTHER"
    if (!categoryCounts[cat]) categoryCounts[cat] = { count: 0, files: [] }
    categoryCounts[cat].count++
    categoryCounts[cat].files.push(d.fileName)
  }

  const present: DocGapResult["present"] = []
  const missing: DocGapResult["missing"] = []

  for (const req of required) {
    const catData = categoryCounts[req.category]
    if (catData && catData.count > 0) {
      const isFullyMet = !req.minCount || catData.count >= req.minCount
      if (isFullyMet) {
        present.push({
          category: req.category,
          fileName: catData.files.join(", "),
          count: catData.count,
        })
      } else {
        // Partially met
        present.push({
          category: req.category,
          fileName: catData.files.join(", "),
          count: catData.count,
        })
        missing.push({
          category: req.category,
          label: `${req.label} (have ${catData.count}, need ${req.minCount})`,
          critical: req.critical,
        })
      }
    } else {
      missing.push({
        category: req.category,
        label: req.label,
        critical: req.critical,
      })
    }
  }

  const totalRequired = required.length
  const totalMet = required.filter(req => {
    const catData = categoryCounts[req.category]
    if (!catData) return false
    if (req.minCount) return catData.count >= req.minCount
    return true
  }).length
  const completeness = totalRequired > 0 ? totalMet / totalRequired : 0

  const criticalMissing = missing.filter(m => m.critical).length
  const summary = criticalMissing > 0
    ? `${criticalMissing} critical document(s) still needed before filing`
    : missing.length > 0
    ? `All critical documents present. ${missing.length} optional item(s) missing.`
    : "All required documents present."

  return { present, missing, completeness, summary }
}
