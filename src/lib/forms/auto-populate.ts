// ---------------------------------------------------------------------------
// Auto-Population Engine v2 — Multi-Source Data Gathering
//
// Pulls from EVERY available data source in priority order:
// 1. Case record (name, phone, email, filing status)
// 2. CaseIntelligence (IRS contact, RPC, compliance status)
// 3. LiabilityPeriods (per-year breakdowns)
// 4. Existing form instances for the same case (form-to-form sharing)
// 5. Approved AI task outputs (reviewed working papers)
// 6. Client notes / call logs
// 7. Document text (categorized, with intelligent truncation)
//
// Structured fields are populated directly with HIGH confidence.
// Claude AI is used only for what can't be determined structurally.
// ---------------------------------------------------------------------------

import type { FormSchema } from "./types"
import { getFormSchema } from "./registry"

export interface AutoPopulatedField {
  fieldId: string
  value: any
  confidence: "high" | "medium" | "low"
  source: { documentId: string; documentName: string; documentType: string }
  extractedFrom: string
}

export interface AutoPopulationResult {
  fields: AutoPopulatedField[]
  highConfidence: number
  needsReview: number
  totalFound: number
  documentsUsed: string[]
}

// ── Source 1: Case record (always high confidence) ──

async function gatherFromCaseRecord(caseId: string): Promise<AutoPopulatedField[]> {
  const { prisma } = await import("@/lib/db")
  const { decryptField } = await import("@/lib/encryption")

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      filingStatus: true,
      totalLiability: true,
      caseType: true,
      tabsNumber: true,
    },
  })

  if (!caseData) return []

  const fields: AutoPopulatedField[] = []
  const src = { documentId: "case-record", documentName: "Case Record", documentType: "CASE" }

  // Client name
  try {
    const name = decryptField(caseData.clientName)
    if (name && name.length > 1) {
      fields.push({ fieldId: "taxpayer_name", value: name, confidence: "high", source: src, extractedFrom: "Case record — client name" })
      // Try to split into first/last for forms that need it
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) {
        fields.push({ fieldId: "taxpayer_first_name", value: parts[0], confidence: "high", source: src, extractedFrom: "Case record" })
        fields.push({ fieldId: "taxpayer_last_name", value: parts.slice(1).join(" "), confidence: "high", source: src, extractedFrom: "Case record" })
      }
    }
  } catch { /* decryption failed */ }

  // Contact info
  try {
    const email = caseData.clientEmail ? decryptField(caseData.clientEmail) : null
    if (email) fields.push({ fieldId: "email", value: email, confidence: "high", source: src, extractedFrom: "Case record — email" })
  } catch {}

  try {
    const phone = caseData.clientPhone ? decryptField(caseData.clientPhone) : null
    if (phone) {
      fields.push({ fieldId: "home_phone", value: phone, confidence: "high", source: src, extractedFrom: "Case record — phone" })
      fields.push({ fieldId: "cell_phone", value: phone, confidence: "medium", source: src, extractedFrom: "Case record — phone (may be home or cell)" })
    }
  } catch {}

  // Filing status → marital status mapping
  if (caseData.filingStatus) {
    const map: Record<string, string> = {
      SINGLE: "single", MFJ: "married", MFS: "married",
      HOH: "single", QW: "widowed", MARRIED: "married",
    }
    const mapped = map[caseData.filingStatus]
    if (mapped) {
      fields.push({ fieldId: "marital_status", value: mapped, confidence: "high", source: src, extractedFrom: `Filing status: ${caseData.filingStatus}` })
      fields.push({ fieldId: "filing_status", value: caseData.filingStatus, confidence: "high", source: src, extractedFrom: "Case record" })
    }
  }

  // Total liability
  if (caseData.totalLiability) {
    const total = Number(caseData.totalLiability)
    if (total > 0) {
      fields.push({ fieldId: "total_liability", value: total, confidence: "high", source: src, extractedFrom: "Case record — total liability" })
    }
  }

  return fields
}

// ── Source 2: Case Intelligence (IRS contact, compliance) ──

async function gatherFromIntelligence(caseId: string): Promise<AutoPopulatedField[]> {
  const { prisma } = await import("@/lib/db")

  const intel = await prisma.caseIntelligence.findUnique({
    where: { caseId },
  }).catch(() => null)

  if (!intel) return []

  const fields: AutoPopulatedField[] = []
  const src = { documentId: "case-intelligence", documentName: "Case Intelligence", documentType: "INTELLIGENCE" }

  // IRS contact info (critical for Form 911)
  if (intel.irsAssignedEmployee)
    fields.push({ fieldId: "irs_employee_name", value: intel.irsAssignedEmployee, confidence: "high", source: src, extractedFrom: "Case intelligence — IRS assigned employee" })
  if (intel.irsEmployeeId)
    fields.push({ fieldId: "irs_employee_id", value: intel.irsEmployeeId, confidence: "high", source: src, extractedFrom: "Case intelligence — IRS employee ID" })
  if (intel.irsAssignedUnit)
    fields.push({ fieldId: "irs_unit", value: intel.irsAssignedUnit, confidence: "high", source: src, extractedFrom: "Case intelligence — IRS unit" })

  // RCP estimate (for OIC forms)
  if (intel.rpcEstimate) {
    const rpc = Number(intel.rpcEstimate)
    if (rpc > 0) {
      fields.push({ fieldId: "rcp_estimate", value: rpc, confidence: "medium", source: src, extractedFrom: "Case intelligence — RCP estimate" })
    }
  }

  // POA status
  if (intel.poaOnFile) {
    fields.push({ fieldId: "poa_on_file", value: true, confidence: "high", source: src, extractedFrom: "Case intelligence — POA on file" })
  }

  return fields
}

// ── Source 3: Liability Periods (per-year tax data) ──

async function gatherFromLiabilityPeriods(caseId: string): Promise<AutoPopulatedField[]> {
  const { prisma } = await import("@/lib/db")

  const periods = await prisma.liabilityPeriod.findMany({
    where: { caseId },
    orderBy: { taxYear: "asc" },
  })

  if (periods.length === 0) return []

  const fields: AutoPopulatedField[] = []
  const src = { documentId: "liability-periods", documentName: "Liability Periods", documentType: "LIABILITY" }

  // Total liability from all periods
  const totalBalance = periods.reduce((s, lp) => s + (Number(lp.totalBalance) || 0), 0)
  const totalPenalties = periods.reduce((s, lp) => s + (Number(lp.penalties) || 0), 0)
  const totalInterest = periods.reduce((s, lp) => s + (Number(lp.interest) || 0), 0)

  if (totalBalance > 0)
    fields.push({ fieldId: "total_liability", value: totalBalance, confidence: "high", source: src, extractedFrom: `Sum of ${periods.length} liability periods` })
  if (totalPenalties > 0)
    fields.push({ fieldId: "total_penalties", value: totalPenalties, confidence: "high", source: src, extractedFrom: "Liability periods — penalties" })
  if (totalInterest > 0)
    fields.push({ fieldId: "total_interest", value: totalInterest, confidence: "high", source: src, extractedFrom: "Liability periods — interest" })

  // Tax periods as a repeating group (for Form 12153 and 433-A)
  const taxPeriods = periods.map((lp) => ({
    tax_year: lp.taxYear,
    form_type: lp.formType,
    balance: Number(lp.totalBalance) || 0,
    penalty: Number(lp.penalties) || 0,
    interest: Number(lp.interest) || 0,
    assessment_date: lp.assessmentDate?.toISOString().split("T")[0] || null,
    csed_date: lp.csedDate?.toISOString().split("T")[0] || null,
    status: lp.status,
  }))

  if (taxPeriods.length > 0) {
    fields.push({ fieldId: "tax_periods", value: taxPeriods, confidence: "high", source: src, extractedFrom: `${taxPeriods.length} tax period(s) from liability records` })
  }

  // Tax years string
  const years = periods.map(lp => lp.taxYear).join(", ")
  fields.push({ fieldId: "tax_years", value: years, confidence: "high", source: src, extractedFrom: "Liability periods" })

  return fields
}

// ── Source 4: Existing form instances for the same case ──

async function gatherFromExistingForms(caseId: string, currentFormNumber: string): Promise<AutoPopulatedField[]> {
  const { prisma } = await import("@/lib/db")

  // Look for completed/in-progress form instances for this case
  const existingForms = await prisma.formInstance.findMany({
    where: { caseId, status: { in: ["in_progress", "complete"] } },
    orderBy: { updatedAt: "desc" },
  }).catch(() => [] as any[])

  if (existingForms.length === 0) return []

  const fields: AutoPopulatedField[] = []

  // Shared field IDs that transfer between forms
  const transferableFields = [
    "taxpayer_name", "taxpayer_first_name", "taxpayer_last_name",
    "ssn", "ssn_last4", "dob", "address_street", "address_city",
    "address_state", "address_zip", "county", "home_phone", "cell_phone",
    "email", "marital_status", "filing_status", "spouse_name", "spouse_ssn",
    "spouse_dob", "employment_type", "dependents",
    "employers", "bank_accounts", "real_property", "vehicles",
    "income_wages", "income_ss", "income_pension", "income_self_employment",
    "expense_housing", "expense_food_clothing", "expense_vehicle_ownership",
    "expense_health_insurance", "total_liability",
  ]

  for (const form of existingForms) {
    if (form.formNumber === currentFormNumber) continue // Don't copy from self
    const values = typeof form.values === "string" ? JSON.parse(form.values) : (form.values || {})
    const src = {
      documentId: `form-${form.id}`,
      documentName: `Form ${form.formNumber} (${form.status})`,
      documentType: "FORM_INSTANCE",
    }

    for (const fieldId of transferableFields) {
      const val = values[fieldId]
      if (val !== null && val !== undefined && val !== "" && val !== 0) {
        // Skip if already populated (first form wins)
        if (fields.some(f => f.fieldId === fieldId)) continue
        fields.push({
          fieldId,
          value: val,
          confidence: "high",
          source: src,
          extractedFrom: `Previously filled Form ${form.formNumber}`,
        })
      }
    }
  }

  return fields
}

// ── Source 5: Approved AI task outputs ──

async function gatherFromAIOutputs(caseId: string): Promise<{ fields: AutoPopulatedField[]; context: string }> {
  const { prisma } = await import("@/lib/db")
  const { decryptField } = await import("@/lib/encryption")

  const tasks = await prisma.aITask.findMany({
    where: { caseId, status: "APPROVED" },
    select: { id: true, taskType: true, detokenizedOutput: true, banjoStepLabel: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  let context = ""
  for (const task of tasks) {
    if (!task.detokenizedOutput) continue
    try {
      const output = decryptField(task.detokenizedOutput)
      if (output && output.length > 50) {
        // Truncate intelligently — keep first 4000 chars of each approved output
        const label = task.banjoStepLabel || task.taskType
        context += `\n=== APPROVED AI OUTPUT: ${label} ===\n`
        context += output.slice(0, 4000)
        if (output.length > 4000) context += "\n[... truncated]"
        context += "\n"
      }
    } catch { /* decryption failed */ }
  }

  return { fields: [], context }
}

// ── Source 6: Client notes (call logs, practitioner observations) ──

async function gatherFromNotes(caseId: string): Promise<string> {
  const { prisma } = await import("@/lib/db")

  const notes = await prisma.clientNote.findMany({
    where: { caseId, isDeleted: false },
    select: { content: true, noteType: true, title: true, callParticipants: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  if (notes.length === 0) return ""

  let context = "\n=== CLIENT NOTES & CALL LOGS ===\n"
  for (const note of notes) {
    if (note.content && note.content.length > 10) {
      context += `[${note.noteType}] ${note.title || ""}`
      if (note.callParticipants) context += ` (Participants: ${note.callParticipants})`
      context += `\n${note.content.slice(0, 1500)}\n\n`
    }
  }
  return context
}

// ── Source 7: Documents (categorized, with smart truncation) ──

interface CategorizedDocs {
  transcripts: string
  taxReturns: string
  bankStatements: string
  payroll: string
  other: string
  docNames: string[]
}

async function gatherDocumentText(caseId: string): Promise<CategorizedDocs> {
  const { prisma } = await import("@/lib/db")

  const docs = await prisma.document.findMany({
    where: { caseId },
    select: {
      fileName: true,
      documentCategory: true,
      extractedText: true,
      statementDate: true,
    },
    orderBy: { uploadedAt: "desc" },
  })

  const result: CategorizedDocs = { transcripts: "", taxReturns: "", bankStatements: "", payroll: "", other: "", docNames: [] }

  // Category-specific limits (transcripts get more space, they're dense with data)
  const limits: Record<string, number> = {
    IRS_NOTICE: 6000,   // IRS transcripts/notices — rich data, give them space
    TAX_RETURN: 6000,   // Tax returns — income, deductions, all the numbers
    BANK_STATEMENT: 4000, // Bank statements — balances, account numbers
    PAYROLL: 3000,       // W-2s, pay stubs
    OTHER: 2000,         // Everything else
  }

  for (const doc of docs) {
    if (!doc.extractedText || doc.extractedText.length < 10) continue
    result.docNames.push(doc.fileName)

    const limit = limits[doc.documentCategory] || limits.OTHER
    const text = doc.extractedText.length > limit
      ? doc.extractedText.slice(0, limit) + "\n[... truncated]"
      : doc.extractedText

    const header = `--- ${doc.fileName} [${doc.documentCategory}]${doc.statementDate ? ` (dated ${doc.statementDate.toISOString().split("T")[0]})` : ""} ---\n`

    switch (doc.documentCategory) {
      case "IRS_NOTICE":
        result.transcripts += header + text + "\n\n"
        break
      case "TAX_RETURN":
        result.taxReturns += header + text + "\n\n"
        break
      case "BANK_STATEMENT":
        result.bankStatements += header + text + "\n\n"
        break
      case "PAYROLL":
        result.payroll += header + text + "\n\n"
        break
      default:
        result.other += header + text + "\n\n"
    }
  }

  return result
}

// ── Build extraction prompt for Claude ──

function buildExtractionPrompt(schema: FormSchema): string {
  const fieldList = schema.sections.flatMap(s =>
    s.fields
      .filter(f => f.type !== "computed" && f.type !== "heading" && f.type !== "divider")
      .map(f => {
        let line = `- ${f.label} (field: "${f.id}", type: ${f.type})`
        if (f.irsReference) line += ` [${f.irsReference}]`
        if (f.type === "repeating_group" && f.groupFields) {
          const subFields = f.groupFields.map(gf => `    - ${gf.label} ("${gf.id}", ${gf.type})`).join("\n")
          line += `\n${subFields}`
        }
        return line
      })
  ).join("\n")

  return `You are extracting financial data from IRS case documents to auto-populate Form ${schema.formNumber} — ${schema.formTitle}.

You have been given:
- STRUCTURED DATA: Facts already known about this case (high confidence)
- DOCUMENT TEXT: Categorized documents to search for additional data

Your job: Extract EVERY remaining piece of information from the documents that maps to a form field. The structured data section tells you what we already know — focus on finding what's MISSING.

FORM FIELDS TO EXTRACT:
${fieldList}

EXTRACTION RULES:
1. Extract from ALL documents — search every section
2. Convert annual income to monthly (÷ 12). W-2 gross wages ÷ 12 = monthly wages
3. For bank accounts, use the MOST RECENT balance (check statement dates)
4. Include EVERY account, property, vehicle, and employer found
5. For IRS transcripts, extract: TC codes, assessment dates, filing dates, penalties, status
6. For tax returns: AGI, filing status, dependents, all income types, all deductions
7. For bank statements: institution, account type, current balance
8. For repeating groups, return arrays of objects matching the sub-field structure
9. Use null for fields you genuinely cannot find
10. Do NOT re-extract fields listed in STRUCTURED DATA — they're already populated

Return ONLY a JSON object mapping field IDs to extracted values. No markdown fences, no explanation.`
}

// ── Main entry point ──

export async function autoPopulateForm(
  caseId: string,
  formNumber: string
): Promise<AutoPopulationResult> {
  try {
    // Phase 1: Gather structured data from all sources (no AI needed)
    const [caseFields, intelFields, liabilityFields, formFields] = await Promise.all([
      gatherFromCaseRecord(caseId).catch(() => [] as AutoPopulatedField[]),
      gatherFromIntelligence(caseId).catch(() => [] as AutoPopulatedField[]),
      gatherFromLiabilityPeriods(caseId).catch(() => [] as AutoPopulatedField[]),
      gatherFromExistingForms(caseId, formNumber).catch(() => [] as AutoPopulatedField[]),
    ])

    // Merge structured fields (first source wins for each field ID)
    const structuredFields = new Map<string, AutoPopulatedField>()

    // Priority order: existing forms > case record > intelligence > liability
    for (const f of formFields) if (!structuredFields.has(f.fieldId)) structuredFields.set(f.fieldId, f)
    for (const f of caseFields) if (!structuredFields.has(f.fieldId)) structuredFields.set(f.fieldId, f)
    for (const f of intelFields) if (!structuredFields.has(f.fieldId)) structuredFields.set(f.fieldId, f)
    for (const f of liabilityFields) if (!structuredFields.has(f.fieldId)) structuredFields.set(f.fieldId, f)

    // Phase 2: Gather context for AI extraction
    const [aiOutputs, notesContext, docText] = await Promise.all([
      gatherFromAIOutputs(caseId).catch(() => ({ fields: [] as AutoPopulatedField[], context: "" })),
      gatherFromNotes(caseId).catch(() => ""),
      gatherDocumentText(caseId).catch(() => ({
        transcripts: "", taxReturns: "", bankStatements: "",
        payroll: "", other: "", docNames: [] as string[],
      })),
    ])

    const documentsUsed = new Set<string>(docText.docNames)
    if (structuredFields.size > 0) documentsUsed.add("Case Record")

    // Phase 3: AI extraction for financial data
    const hasDocuments = docText.transcripts || docText.taxReturns || docText.bankStatements || docText.payroll || docText.other

    if (hasDocuments) {
      const schema = getFormSchema(formNumber)
      const systemPrompt = schema
        ? buildExtractionPrompt(schema)
        : buildExtractionPrompt(getFormSchema("433-A")!) // Fallback to 433-A

      // Build the user message with all available context
      let userMessage = ""

      // Include what we already know (so AI doesn't waste effort re-extracting)
      const knownData = Array.from(structuredFields.values())
      if (knownData.length > 0) {
        userMessage += "STRUCTURED DATA (already populated — do not re-extract):\n"
        for (const f of knownData) {
          const displayVal = typeof f.value === "object" ? JSON.stringify(f.value).slice(0, 200) : String(f.value)
          userMessage += `  ${f.fieldId}: ${displayVal}\n`
        }
        userMessage += "\n"
      }

      // Add categorized documents
      userMessage += "DOCUMENTS TO ANALYZE:\n\n"
      if (docText.transcripts) userMessage += "── IRS TRANSCRIPTS & NOTICES ──\n" + docText.transcripts
      if (docText.taxReturns) userMessage += "── TAX RETURNS ──\n" + docText.taxReturns
      if (docText.bankStatements) userMessage += "── BANK STATEMENTS ──\n" + docText.bankStatements
      if (docText.payroll) userMessage += "── PAYROLL / W-2s ──\n" + docText.payroll
      if (docText.other) userMessage += "── OTHER DOCUMENTS ──\n" + docText.other

      // Add approved AI outputs and notes as supplementary context
      if (aiOutputs.context) userMessage += "\n── REVIEWED AI WORK PRODUCTS ──\n" + aiOutputs.context
      if (notesContext) userMessage += "\n" + notesContext

      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic()

        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        })

        const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        const clean = text.replace(/```json\n?|```\n?/g, "").trim()

        // Parse — try direct, then strip to first { ... last }
        let extractedData: Record<string, any> = {}
        try {
          extractedData = JSON.parse(clean)
        } catch {
          const firstBrace = clean.indexOf("{")
          const lastBrace = clean.lastIndexOf("}")
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try { extractedData = JSON.parse(clean.slice(firstBrace, lastBrace + 1)) } catch {}
          }
        }

        // Add AI-extracted fields (only for fields not already in structured data)
        const aiSrc = {
          documentId: "ai-extraction",
          documentName: `AI analyzed ${docText.docNames.length} documents`,
          documentType: "AI_EXTRACTION",
        }

        for (const [fieldId, value] of Object.entries(extractedData)) {
          if (structuredFields.has(fieldId)) continue // Skip — structured data wins
          if (value === null || value === undefined || value === "" || (typeof value === "number" && value === 0)) continue

          // Determine confidence based on document category support
          let confidence: "high" | "medium" | "low" = "medium"

          // Financial fields from tax returns/transcripts get higher confidence
          if ((docText.taxReturns || docText.transcripts) &&
            (fieldId.startsWith("income_") || fieldId.startsWith("expense_") || fieldId === "total_liability")) {
            confidence = "high"
          }
          // Bank data from bank statements gets higher confidence
          if (docText.bankStatements && fieldId === "bank_accounts") {
            confidence = "high"
          }
          // Employment from W-2s/payroll gets higher confidence
          if (docText.payroll && fieldId === "employers") {
            confidence = "high"
          }
          // Identity fields without doc support stay medium
          if (fieldId.startsWith("address_") || fieldId === "dob" || fieldId === "ssn_last4") {
            confidence = docText.taxReturns ? "medium" : "low"
          }

          structuredFields.set(fieldId, {
            fieldId,
            value,
            confidence,
            source: aiSrc,
            extractedFrom: `AI extracted from ${docText.docNames.length} document(s)`,
          })
        }
      } catch (error: any) {
        console.error("[Auto-populate] AI extraction failed:", error?.message)
        // Continue with just structured data — don't fail entirely
      }
    }

    // Phase 4: Build final result
    const allFields = Array.from(structuredFields.values())
    const highCount = allFields.filter(f => f.confidence === "high").length
    const reviewCount = allFields.filter(f => f.confidence !== "high").length

    return {
      fields: allFields,
      highConfidence: highCount,
      needsReview: reviewCount,
      totalFound: allFields.length,
      documentsUsed: Array.from(documentsUsed),
    }
  } catch (error) {
    console.error("[Auto-populate] Fatal error:", error)
    return { fields: [], highConfidence: 0, needsReview: 0, totalFound: 0, documentsUsed: [] }
  }
}
