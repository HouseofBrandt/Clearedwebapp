import { formatDate } from "@/lib/date-utils"

// ═══════════════════════════════════════════════════
// 1. REQUIRED DOCUMENTS BY CASE TYPE
// ═══════════════════════════════════════════════════
export const REQUIRED_DOCS: Record<string, Array<{
  category: string
  label: string
  critical: boolean
  minCount?: number
}>> = {
  OIC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts (all open tax years)", critical: true },
    { category: "BANK_STATEMENT", label: "Personal bank statements (3 consecutive months)", critical: true, minCount: 3 },
    { category: "BANK_STATEMENT", label: "Business bank statements (3 consecutive months)", critical: true, minCount: 3 },
    { category: "PAY_STUB", label: "Pay stubs or income documentation (2 recent months)", critical: true, minCount: 2 },
    { category: "TAX_RETURN", label: "Tax returns for all open years", critical: true },
    { category: "MORTGAGE_STATEMENT", label: "Mortgage statement(s) — one per property", critical: true },
    { category: "INSURANCE", label: "Health insurance documentation", critical: true },
    { category: "RETIREMENT_ACCOUNT", label: "Retirement account statements (all accounts)", critical: true },
    { category: "VEHICLE_LOAN", label: "Vehicle loan or title statements", critical: false },
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
    { category: "IRS_NOTICE", label: "IRS Account Transcripts (penalty years + 3 prior years for FTA check)", critical: true },
    { category: "IRS_NOTICE", label: "IRS penalty or collection notices", critical: true },
  ],
  CNC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts", critical: true },
    { category: "BANK_STATEMENT", label: "Bank statements (3 months)", critical: true, minCount: 3 },
    { category: "PAY_STUB", label: "Income documentation", critical: true },
    { category: "INSURANCE", label: "Health insurance", critical: true },
    { category: "MEDICAL", label: "Medical records (if hardship basis)", critical: false },
  ],
  TFRP: [
    { category: "IRS_NOTICE", label: "Business transcripts — Form 941 (all quarters at issue)", critical: true },
    { category: "IRS_NOTICE", label: "Letter 1153 or TFRP assessment notice", critical: true },
    { category: "BANK_STATEMENT", label: "Business bank statements", critical: true },
  ],
  INNOCENT_SPOUSE: [
    { category: "TAX_RETURN", label: "Joint tax returns for all periods at issue", critical: true },
    { category: "IRS_NOTICE", label: "IRS deficiency or collection notices", critical: true },
    { category: "BANK_STATEMENT", label: "Separate bank statements (requesting spouse)", critical: false },
  ],
  CDP: [
    { category: "IRS_NOTICE", label: "LT11 / Letter 1058 (triggering notice)", critical: true },
    { category: "IRS_NOTICE", label: "Account transcripts for all periods", critical: true },
  ],
}

// ═══════════════════════════════════════════════════
// 2. DEADLINE CONSEQUENCES
// ═══════════════════════════════════════════════════
export const DEADLINE_CONSEQUENCES: Record<string, string> = {
  CDP_HEARING: "IRREVERSIBLE — Losing the 30-day CDP window means no Tax Court jurisdiction under IRC § 6330. Only an Equivalent Hearing (no judicial review) remains available. The IRS can proceed with levy.",
  EQUIVALENT_HEARING: "Missing this eliminates the last administrative avenue to challenge the levy before it happens. File immediately.",
  TAX_COURT_PETITION: "IRREVERSIBLE — Missing the 90-day petition deadline means the deficiency becomes assessed and collectible. The only remaining option is pay-and-sue in District Court or Court of Federal Claims.",
  CSED_EXPIRATION: "FAVORABLE — CSED expiration extinguishes the liability. Verify no tolling events (OIC pending, IA request, bankruptcy, CDP) extend the date. Filing an OIC tolls the CSED per IRC § 6331(k)(1).",
  OIC_SUBMISSION: "Interest and penalties accrue every day the OIC is not filed. If an Equivalent Hearing is pending, the hearing may proceed without the OIC in hand.",
  OIC_PAYMENT: "CATASTROPHIC — Missing a post-acceptance OIC payment can DEFAULT the agreement under IRC § 7122(c)(1). The IRS reinstates the FULL original liability minus amounts already paid.",
  OIC_COMPLIANCE: "The 5-year compliance period requires timely filing and payment. Non-compliance DEFAULTS the OIC and reinstates the full original liability.",
  IA_PAYMENT: "Missing an IA payment triggers CP523 default notice. The IRS can resume levy action. The taxpayer gets 30 days to cure.",
  RETURN_DUE: "Late filing triggers the failure-to-file penalty at 5%/month (max 25%) under IRC § 6651(a)(1). For OIC/IA cases, filing compliance is required for processability per IRM 5.8.3.7.",
  EXTENSION_DUE: "Missing the extension deadline converts to a late-filed return. File the extension even if you cannot file the return — it prevents the FTF penalty.",
  ESTIMATED_TAX: "Missing estimated payments triggers the IRC § 6654 underpayment penalty. For OIC cases, current-year compliance is required or the offer is non-processable.",
  POA_RENEWAL: "An expired POA means the IRS will refuse to communicate with the practitioner. File a new Form 2848 immediately.",
  IRS_RESPONSE: "Failure to respond to an IRS information request can result in the IRS deciding based on available (unfavorable) information only.",
  DOCUMENT_REQUEST: "Missing an IRS document request deadline can cause case closure, offer return, or adverse determination. Always respond — request an extension in writing if you need more time.",
}

// ═══════════════════════════════════════════════════
// 3. DOCUMENT GAP ANALYSIS
// ═══════════════════════════════════════════════════
export interface DocGapResult {
  present: Array<{ category: string; files: string[]; count: number }>
  missing: Array<{ category: string; label: string; critical: boolean }>
  completeness: number
  criticalMissing: number
  summary: string
}

export function analyzeDocumentGaps(caseData: {
  caseType: string
  documents: Array<{ documentCategory: string; fileName: string }>
}): DocGapResult {
  const required = REQUIRED_DOCS[caseData.caseType] || REQUIRED_DOCS["OIC"]

  // Count docs per category
  const byCat: Record<string, string[]> = {}
  for (const d of caseData.documents || []) {
    const cat = d.documentCategory || "OTHER"
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(d.fileName)
  }

  const present: DocGapResult["present"] = []
  const missing: DocGapResult["missing"] = []

  for (const req of required) {
    const files = byCat[req.category] || []
    if (files.length === 0) {
      missing.push({ category: req.category, label: req.label, critical: req.critical })
    } else if (req.minCount && files.length < req.minCount) {
      present.push({ category: req.category, files, count: files.length })
      missing.push({
        category: req.category,
        label: `${req.label} — have ${files.length}, need ${req.minCount}`,
        critical: req.critical,
      })
    } else {
      present.push({ category: req.category, files, count: files.length })
    }
  }

  const met = required.filter(req => {
    const count = (byCat[req.category] || []).length
    return req.minCount ? count >= req.minCount : count > 0
  }).length
  const completeness = required.length > 0 ? met / required.length : 0
  const criticalMissing = missing.filter(m => m.critical).length

  const summary = criticalMissing > 0
    ? `${criticalMissing} critical document(s) still needed before filing.`
    : missing.length > 0
      ? `All critical documents present. ${missing.length} optional item(s) missing.`
      : "All required documents present — ready to proceed."

  return { present, missing, completeness, criticalMissing, summary }
}

// ═══════════════════════════════════════════════════
// 4. CASE HEALTH CHECK
// ═══════════════════════════════════════════════════
export function assessCaseHealth(caseData: any): string[] {
  const issues: string[] = []
  const now = new Date()

  // Document gaps (reuse gap analysis)
  const gap = analyzeDocumentGaps(caseData)
  for (const m of gap.missing.filter(x => x.critical)) {
    issues.push(`MISSING DOCUMENT: ${m.label}`)
  }

  // Documents uploaded but no analysis
  if ((caseData.documents?.length || 0) > 2 && (caseData.aiTasks?.length || 0) === 0) {
    issues.push("NO ANALYSIS RUN: Documents are uploaded but no AI analysis has been triggered yet")
  }

  // Stale case
  if (caseData.updatedAt) {
    const days = Math.floor((now.getTime() - new Date(caseData.updatedAt).getTime()) / 86400000)
    if (days > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
      issues.push(`STALE: No activity in ${days} days — verify this case is being actively worked`)
    }
  }

  // Pending reviews
  const pending = (caseData.aiTasks || []).filter((t: any) => t.status === "READY_FOR_REVIEW")
  if (pending.length > 0) {
    issues.push(`${pending.length} AI output(s) awaiting review — review before proceeding with new analyses`)
  }

  // Rejected tasks
  const rejected = (caseData.aiTasks || []).filter((t: any) => t.status === "REJECTED")
  if (rejected.length > 0) {
    issues.push(`${rejected.length} rejected task(s) — consider re-running with corrections`)
  }

  // No deadlines on deadline-critical case types
  if ((caseData.deadlines?.length || 0) === 0) {
    if (caseData.caseType === "CDP") {
      issues.push("CRITICAL: No CDP hearing deadline set — this is the most time-sensitive deadline in tax resolution")
    } else if (caseData.caseType === "OIC") {
      issues.push("No OIC deadlines set — add submission target date and compliance milestones")
    }
  }

  // Overdue deadlines
  for (const d of caseData.deadlines || []) {
    if (new Date(d.dueDate) < now && d.status === "UPCOMING") {
      const daysOver = Math.floor((now.getTime() - new Date(d.dueDate).getTime()) / 86400000)
      issues.push(`OVERDUE: ${d.title} — ${daysOver} day(s) past due`)
    }
  }

  // Liability not set
  if (!caseData.totalLiability || Number(caseData.totalLiability) === 0) {
    issues.push("Total liability not set on case record — update after pulling transcripts")
  }

  // Smart Status intelligence checks
  const intel = caseData.intelligence
  if (intel) {
    if (intel.levyThreatActive) issues.push("⚠ LEVY THREAT ACTIVE — prioritize protective action (Equivalent Hearing, OIC filing, or PPIA)")
    if (intel.liensFiledActive) issues.push("⚠ Federal tax lien filed — may affect property sales, credit, and loan applications")
    if (!intel.allReturnsFiled && ["OIC", "IA"].includes(caseData.caseType)) {
      issues.push("Filing compliance NOT verified — OIC/IA require all returns filed per IRM 5.8.3.7")
    }
    if (!intel.currentOnEstimates && ["OIC", "IA"].includes(caseData.caseType)) {
      issues.push("Estimated tax payments NOT verified — required for OIC/IA processability")
    }
    if (!intel.poaOnFile) {
      issues.push("No Power of Attorney (Form 2848) on file — IRS will not communicate with practitioner")
    }
  }

  return issues
}

// ═══════════════════════════════════════════════════
// 5. NEXT STEP RECOMMENDATIONS
// ═══════════════════════════════════════════════════
export interface WorkflowStep {
  priority: "CRITICAL" | "HIGH" | "NORMAL"
  action: string
  reason: string
}

export function getNextSteps(caseData: any): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const now = new Date()

  const docCats = new Set((caseData.documents || []).map((d: any) => d.documentCategory))
  const taskMap: Record<string, string> = {}
  for (const t of caseData.aiTasks || []) {
    taskMap[t.taskType] = t.status
  }
  const hasTask = (type: string) => type in taskMap
  const taskApproved = (type: string) => taskMap[type] === "APPROVED"
  const hasPendingReview = Object.values(taskMap).includes("READY_FOR_REVIEW")

  // ── Urgent deadlines ──
  for (const d of caseData.deadlines || []) {
    const due = new Date(d.dueDate)
    const daysUntil = Math.floor((due.getTime() - now.getTime()) / 86400000)
    if (daysUntil < 0 && d.status === "UPCOMING") {
      steps.push({
        priority: "CRITICAL",
        action: `OVERDUE: ${d.title} was due ${Math.abs(daysUntil)} day(s) ago`,
        reason: DEADLINE_CONSEQUENCES[(d as any).type] || "Address immediately.",
      })
    } else if (daysUntil <= 7 && daysUntil >= 0 && d.status === "UPCOMING") {
      steps.push({
        priority: "CRITICAL",
        action: `DEADLINE: ${d.title} — due in ${daysUntil} day(s) (${formatDate(due)})`,
        reason: DEADLINE_CONSEQUENCES[(d as any).type] || "Complete before deadline.",
      })
    }
  }

  // ── Pending reviews block progress ──
  if (hasPendingReview) {
    const count = Object.values(taskMap).filter(s => s === "READY_FOR_REVIEW").length
    steps.push({
      priority: "HIGH",
      action: `Review ${count} pending AI output(s) in the Review Queue`,
      reason: "No output becomes a deliverable until reviewed. This blocks downstream work.",
    })
  }

  // ── INTAKE stage ──
  if (caseData.status === "INTAKE") {
    if (!docCats.has("IRS_NOTICE")) {
      steps.push({
        priority: "HIGH",
        action: "Pull IRS account transcripts (IMFOLT) for all tax years",
        reason: "Transcripts establish total liability, CSEDs, penalty exposure, and filing compliance. Request via CAF unit or e-Services. This is prerequisite #1.",
      })
    }

    if ((caseData.documents?.length || 0) === 0) {
      steps.push({
        priority: "HIGH",
        action: "Upload client documents",
        reason: "No documents uploaded. Collect: bank statements (3 months personal + business), pay stubs, mortgage docs, insurance, retirement statements, vehicle loan statements.",
      })
    }

    if ((caseData.documents?.length || 0) >= 3 && !hasTask("GENERAL_ANALYSIS")) {
      steps.push({
        priority: "NORMAL",
        action: "Run General Analysis",
        reason: `${caseData.documents.length} documents are uploaded. General Analysis will identify key issues, estimate liability, and recommend resolution strategy.`,
      })
    }
  }

  // ── Post-General-Analysis workflow by case type ──
  if (taskApproved("GENERAL_ANALYSIS")) {
    if (caseData.caseType === "OIC") {
      if (!hasTask("WORKING_PAPERS")) {
        steps.push({ priority: "NORMAL", action: "Run OIC Working Papers (Form 433-A/B extraction with RCP)", reason: "Produces the structured financial analysis. Required before Form 656 filing." })
      }
      if (taskApproved("WORKING_PAPERS") && !hasTask("OIC_NARRATIVE")) {
        steps.push({ priority: "NORMAL", action: "Run OIC Narrative (Section 9 of Form 656)", reason: "Tells the taxpayer's story. Run after Working Papers so it can reference the financial analysis." })
      }
    }

    if (["OIC", "PENALTY"].includes(caseData.caseType) && !hasTask("PENALTY_LETTER")) {
      steps.push({ priority: "NORMAL", action: "Run Penalty Abatement Letter", reason: "Evaluate FTA (IRM 20.1.1.3.6.1) and reasonable cause (IRC § 6651). For OIC cases, reducing penalties lowers the RCP." })
    }

    if (caseData.caseType === "TFRP" && !hasTask("TFRP_ANALYSIS")) {
      steps.push({ priority: "HIGH", action: "Run TFRP Analysis", reason: "Identify responsible persons, assess willfulness, prepare Form 4180 defense. Do before any IRS interview." })
    }

    if (caseData.caseType === "INNOCENT_SPOUSE" && !hasTask("INNOCENT_SPOUSE_ANALYSIS")) {
      steps.push({ priority: "HIGH", action: "Run Innocent Spouse Analysis", reason: "Evaluate § 6015(b)/(c)/(f) eligibility and Rev. Proc. 2013-34 factors." })
    }

    if (caseData.caseType === "IA" && !hasTask("IA_ANALYSIS")) {
      steps.push({ priority: "NORMAL", action: "Run IA Analysis", reason: "Determine IA type (streamlined, non-streamlined, PPIA), minimum payment, and CSED payoff timeline." })
    }

    if (caseData.caseType === "CNC" && !hasTask("CNC_ANALYSIS")) {
      steps.push({ priority: "NORMAL", action: "Run CNC Analysis", reason: "Evaluate hardship criteria and expected closing code." })
    }
  }

  // ── Compliance gaps ──
  const intel = caseData.intelligence
  if (intel && ["OIC", "IA"].includes(caseData.caseType)) {
    if (!intel.allReturnsFiled) {
      steps.push({ priority: "HIGH", action: "Verify all returns filed (processability requirement)", reason: "OIC and IA require full filing compliance per IRM 5.8.3.7." })
    }
    if (!intel.currentOnEstimates) {
      steps.push({ priority: "HIGH", action: "Verify current-year estimated tax payments", reason: "Required for processability. Check 1040-ES deposits." })
    }
  }
  if (intel && !intel.poaOnFile) {
    steps.push({ priority: "NORMAL", action: "File Form 2848 (Power of Attorney)", reason: "IRS will not communicate with practitioner without active POA." })
  }

  // ── Stale case ──
  if (caseData.updatedAt) {
    const days = Math.floor((now.getTime() - new Date(caseData.updatedAt).getTime()) / 86400000)
    if (days > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
      steps.push({ priority: "NORMAL", action: `Case inactive for ${days} days — review and update`, reason: "Stale cases may have missed deadlines or unaddressed client needs." })
    }
  }

  // Sort by priority
  const order = { CRITICAL: 0, HIGH: 1, NORMAL: 2 }
  steps.sort((a, b) => order[a.priority] - order[b.priority])
  return steps
}
