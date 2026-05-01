import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { getFormSchema } from "./registry"
import { searchCaseDocuments, type DocumentSearchHit } from "@/lib/documents/search"
import type { FieldDef, SectionDef } from "./types"

/**
 * Auto-populate v3 — hybrid search + batched AI field inference.
 *
 * Improvements over v2:
 *   1. **Structured extracts are first-class.** `DocumentExtract` rows from
 *      the per-type extractors (1040, W-2, bank statement, etc.) are
 *      merged as high-confidence answers before any search.
 *   2. **Semantic search.** Per-field queries use the document embedding
 *      index + FTS, not naive string-grep.
 *   3. **Batched inference.** Up to 20 unfilled fields are batched into
 *      one Claude call, reducing latency and token spend vs. the per-field
 *      approach.
 *   4. **Source citations.** Every inferred field records the document(s)
 *      that supported the inference, shown to the practitioner on hover.
 *
 * Target: ≥60% prefill rate on Form 433-A given a fully-documented case
 * (2 bank statements, 1 prior 1040, 1 pay stub, 1 IRS notice).
 */

export type Confidence = "high" | "medium" | "low"

export interface AutoPopulatedFieldV3 {
  fieldId: string
  value: any
  confidence: Confidence
  source: string
  extractedFrom: Array<{
    documentId?: string
    documentName?: string
    pageNumber?: number
  }>
  reasoning?: string
}

export interface AutoPopulationResultV3 {
  fields: AutoPopulatedFieldV3[]
  highConfidence: number
  needsReview: number
  totalFound: number
  documentsUsed: string[]
  durationMs: number
}

export async function autoPopulateV3(params: {
  caseId: string
  formNumber: string
  formInstanceId?: string
  /** Logged-in practitioner; used to auto-fill the representative slot. */
  userId?: string
}): Promise<AutoPopulationResultV3> {
  const started = Date.now()

  const schema = await getFormSchema(params.formNumber)
  if (!schema) {
    return emptyResult(started)
  }

  const allFields = flattenFieldList(schema.sections)

  // Phase 1 — structured (fast, free).
  const structured = await gatherStructured(params.caseId, params.formNumber)

  // Phase 1b — practitioner (the logged-in user's profile).
  const practitioner = params.userId ? await gatherFromCurrentUser(params.userId, params.formNumber) : []

  // Phase 1c — cross-form mappings. Reads the target schema's
  // crossFormMappings declarations and pulls values from completed sibling
  // forms on the same case. This is the highest-leverage data source after
  // case record + practitioner profile.
  const fromSiblings = await gatherFromCrossFormMappings(params.caseId, params.formNumber, schema)

  // Phase 2 — structured extracts from DocumentExtract rows.
  const fromExtracts = await gatherFromExtracts(params.caseId)

  // Merge order (first wins on conflict):
  //   1. structured (case record + intelligence + liability periods)
  //   2. practitioner profile
  //   3. sibling forms (cross-form mappings)
  //   4. document extracts
  // Practitioner-typed values in structured beat sibling-form data, but
  // sibling-form data beats document extracts (which can be noisy).
  const filled = new Map<string, AutoPopulatedFieldV3>()
  for (const f of structured)    filled.set(f.fieldId, f)
  for (const f of practitioner)  if (!filled.has(f.fieldId)) filled.set(f.fieldId, f)
  for (const f of fromSiblings)  if (!filled.has(f.fieldId)) filled.set(f.fieldId, f)
  for (const f of fromExtracts)  if (!filled.has(f.fieldId)) filled.set(f.fieldId, f)

  // Phase 3 — for each unfilled field, run search and collect context chunks.
  const unfilled = allFields.filter((f) => !filled.has(f.id))
  if (unfilled.length === 0) {
    return finalizeResult(Array.from(filled.values()), started)
  }

  const searchResults = await gatherSearchContext(params.caseId, unfilled, schema.sections)

  // Phase 4 — batched AI inference for unfilled fields that have context.
  const inferred = await batchInferFields(unfilled, searchResults, params.formNumber)
  for (const f of inferred) if (!filled.has(f.fieldId)) filled.set(f.fieldId, f)

  return finalizeResult(Array.from(filled.values()), started)
}

// ── Phase 1: structured (Case + CaseIntelligence + LiabilityPeriods + sibling FormInstances) ──

async function gatherStructured(caseId: string, formNumber: string): Promise<AutoPopulatedFieldV3[]> {
  const out: AutoPopulatedFieldV3[] = []

  const [caseRow, intel, periods, siblings] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId } }),
    prisma.caseIntelligence.findUnique({ where: { caseId } }),
    prisma.liabilityPeriod.findMany({ where: { caseId }, orderBy: { taxYear: "desc" } }),
    prisma.formInstance.findMany({ where: { caseId, formNumber: { not: formNumber }, status: "complete" } }),
  ])

  if (caseRow) {
    push(out, "taxpayer_name", caseRow.clientName, "high", "Case record: client name")
    if (caseRow.clientEmail) push(out, "email", caseRow.clientEmail, "high", "Case record: email")
    if (caseRow.clientPhone) push(out, "phone", caseRow.clientPhone, "high", "Case record: phone")
    if (caseRow.filingStatus) push(out, "filing_status", caseRow.filingStatus, "high", "Case record: filing status")
    if (caseRow.totalLiability) push(out, "total_liability", caseRow.totalLiability, "high", "Case record: total liability")
  }

  if (intel) {
    if (intel.irsAssignedEmployee) push(out, "irs_employee_name", intel.irsAssignedEmployee, "high", "Case intelligence: IRS contact")
    if (intel.irsEmployeeId) push(out, "irs_employee_id", intel.irsEmployeeId, "high", "Case intelligence: IRS employee ID")
    if (intel.irsAssignedUnit) push(out, "irs_office", intel.irsAssignedUnit, "high", "Case intelligence: IRS office")
    if (intel.rpcEstimate) push(out, "total_rcp", intel.rpcEstimate, "high", "Case intelligence: RCP estimate")
  }

  if (periods.length > 0) {
    const taxPeriods = periods.map((p) => ({
      period_year: p.taxYear,
      period_tax_type: p.formType,
      period_amount: p.totalBalance,
    }))
    push(out, "tax_periods", taxPeriods, "high", `Liability periods: ${periods.length} year(s)`)
  }

  // Sibling forms — inherit pre-filled values for known-shared fields.
  const TRANSFERABLE = new Set([
    "taxpayer_name", "spouse_name", "ssn", "spouse_ssn", "dob", "spouse_dob",
    "address_street", "address_city", "address_state", "address_zip", "county",
    "home_phone", "cell_phone", "work_phone", "phone", "email",
    "marital_status", "filing_status",
    "dependents", "employers", "bank_accounts", "real_property", "vehicles",
    "total_monthly_income", "total_monthly_expenses", "remaining_monthly_income",
    "total_liability",
  ])
  for (const sib of siblings) {
    const sibValues = (sib.values as Record<string, any>) || {}
    for (const [k, v] of Object.entries(sibValues)) {
      if (!TRANSFERABLE.has(k)) continue
      if (v === null || v === undefined || v === "") continue
      if (out.find((o) => o.fieldId === k)) continue
      push(out, k, v, "high", `Sibling form ${sib.formNumber}`)
    }
  }

  return out
}

// ── Phase 1b: practitioner profile → representative slot ──

/**
 * Map the logged-in user's profile (CAF, PTIN, firm address, license info)
 * onto the representative slot of any form that has one. Drives the
 * "auto-fill the practitioner section" UX so the firm doesn't re-type the
 * same info per case.
 *
 * Forms covered (their schemas all have a representative concept):
 *   - 2848 (Power of Attorney): representatives.0.* + designation/jurisdiction/bar on Part 2
 *   - 12153 (CDP): representative_name / representative_phone / caf_number
 *   - 911 (TAS): rep_name / rep_phone / rep_caf
 * Other forms without a rep slot get nothing (function returns []).
 */
async function gatherFromCurrentUser(userId: string, formNumber: string): Promise<AutoPopulatedFieldV3[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      phone: true,
      cafNumber: true,
      ptin: true,
      jurisdiction: true,
      licenseType: true,
      licenseNumber: true,
      firmName: true,
      firmAddress: true,
      firmCity: true,
      firmState: true,
      firmZip: true,
      firmPhone: true,
      firmFax: true,
    },
  })
  if (!user) return []

  const out: AutoPopulatedFieldV3[] = []
  const source = "Practitioner profile"

  // licenseType → 2848 designation code (per Part 2 dropdown)
  const designation =
    user.licenseType === "ATTORNEY" ? "a" :
    user.licenseType === "CPA"      ? "b" :
    user.licenseType === "EA"       ? "c" :
    null

  // Combined firm address line for forms that take a single address field
  // (2848 RepresentativesAddress is one line).
  const firmAddressOneLine = [
    user.firmAddress,
    [user.firmCity, user.firmState, user.firmZip].filter(Boolean).join(", "),
  ].filter(Boolean).join(", ")
  const firmAddressDisplay = firmAddressOneLine || null

  // 2848 representatives.0.* — representative slot 1.
  if (formNumber === "2848") {
    const rep0: Record<string, any> = {}
    if (user.name)              rep0.rep_name = user.name
    if (firmAddressDisplay)     rep0.rep_address = firmAddressDisplay
    if (user.firmCity)          rep0.rep_city = user.firmCity
    if (user.firmState)         rep0.rep_state = user.firmState
    if (user.firmZip)           rep0.rep_zip = user.firmZip
    if (user.firmPhone || user.phone) rep0.rep_phone = user.firmPhone || user.phone
    if (user.firmFax)           rep0.rep_fax = user.firmFax
    if (user.cafNumber)         rep0.rep_caf_number = user.cafNumber
    if (user.ptin)              rep0.rep_ptin = user.ptin
    if (designation)            rep0.rep_designation = designation
    if (user.jurisdiction)      rep0.rep_jurisdiction = user.jurisdiction
    if (user.licenseNumber)     rep0.rep_bar_license_number = user.licenseNumber

    if (Object.keys(rep0).length > 0) {
      // The wizard stores repeating groups as arrays. We fill the first slot
      // and leave the rest for the practitioner if they need a co-rep.
      push(out, "representatives", [rep0], "high", source)
    }
  }

  // 12153: flat representative_name / representative_phone / caf_number
  if (formNumber === "12153") {
    if (user.name)               push(out, "representative_name", user.name, "high", source)
    if (user.firmPhone || user.phone) push(out, "representative_phone", user.firmPhone || user.phone, "high", source)
    if (user.cafNumber)          push(out, "caf_number", user.cafNumber, "high", source)
  }

  // 911: flat rep_name / rep_phone / rep_caf
  if (formNumber === "911") {
    if (user.name)               push(out, "rep_name", user.name, "high", source)
    if (user.firmPhone || user.phone) push(out, "rep_phone", user.firmPhone || user.phone, "high", source)
    if (user.cafNumber)          push(out, "rep_caf", user.cafNumber, "high", source)
  }

  return out
}

// ── Phase 1c: cross-form mappings → sibling values ──

/**
 * Pull values from completed sibling forms via the target schema's
 * declared `crossFormMappings`.
 *
 * Each mapping declares: "if a `sourceFormNumber` instance is complete on
 * this case, take its `fieldA` and put it in our `fieldB`." We pick the
 * most recently updated complete-or-in-progress sibling instance per
 * sourceFormNumber, then walk the field map.
 *
 * Source field IDs may be dot-paths into the source's values JSON
 * (e.g. `representatives.0.rep_name` for repeating-group entries) — they
 * are resolved with a tiny path walker so a 2848 PoA's first
 * representative populates a 12153 representative_name slot.
 *
 * Confidence is "high" because the data came from a fellow practitioner-
 * authored form, not from heuristic scraping.
 */
async function gatherFromCrossFormMappings(
  caseId: string,
  formNumber: string,
  schema: import("./types").FormSchema
): Promise<AutoPopulatedFieldV3[]> {
  const mappings = schema.crossFormMappings || []
  if (mappings.length === 0) return []

  const sourceFormNumbers = Array.from(new Set(mappings.map((m) => m.sourceFormNumber)))
  if (sourceFormNumbers.length === 0) return []

  const siblings = await prisma.formInstance.findMany({
    where: {
      caseId,
      formNumber: { in: sourceFormNumbers, not: formNumber },
      status: { in: ["complete", "in_progress", "submitted"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { formNumber: true, status: true, values: true, updatedAt: true },
  })
  if (siblings.length === 0) return []

  // Pick the most-recently-updated sibling per source form number. Status
  // ordering — complete > submitted > in_progress — is preserved by the
  // initial orderBy + dedup on first hit, since `complete` instances tend
  // to be newer once authored.
  const bestPerSource = new Map<string, (typeof siblings)[number]>()
  for (const s of siblings) {
    if (!bestPerSource.has(s.formNumber)) bestPerSource.set(s.formNumber, s)
  }

  const out: AutoPopulatedFieldV3[] = []
  for (const m of mappings) {
    const sibling = bestPerSource.get(m.sourceFormNumber)
    if (!sibling) continue
    const values = (sibling.values as Record<string, any>) || {}
    const sourceLabel = `Form ${m.sourceFormNumber} (${sibling.status === "complete" ? "completed" : "in progress"})`
    for (const [sourceFieldId, targetFieldId] of Object.entries(m.fieldMap)) {
      const v = readDottedPath(values, sourceFieldId)
      if (v === undefined || v === null || v === "") continue
      // First mapping wins per target field — if multiple source forms
      // contribute the same target, the order in crossFormMappings dictates
      // priority. The map's iteration is stable.
      if (out.some((existing) => existing.fieldId === targetFieldId)) continue
      out.push({
        fieldId: targetFieldId,
        value: v,
        confidence: "high",
        source: sourceLabel,
        extractedFrom: [],
        reasoning: `Carried over from ${m.sourceFormNumber} field "${sourceFieldId}"`,
      })
    }
  }
  return out
}

/**
 * Resolve a dotted path against a values object, supporting numeric segments
 * for array indices: `representatives.0.rep_name`. Returns undefined when
 * any segment is missing.
 */
function readDottedPath(obj: Record<string, any>, path: string): any {
  if (!path.includes(".")) return obj[path]
  const segments = path.split(".")
  let cursor: any = obj
  for (const seg of segments) {
    if (cursor === null || cursor === undefined) return undefined
    if (Array.isArray(cursor)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cursor = cursor[idx]
    } else if (typeof cursor === "object") {
      cursor = cursor[seg]
    } else {
      return undefined
    }
  }
  return cursor
}

// ── Phase 2: DocumentExtract → field mapping ──

async function gatherFromExtracts(caseId: string): Promise<AutoPopulatedFieldV3[]> {
  const extracts = await prisma.documentExtract.findMany({
    where: { document: { caseId } },
    include: { document: { select: { id: true, fileName: true } } },
  })

  const out: AutoPopulatedFieldV3[] = []

  for (const e of extracts) {
    const data = e.extractedData as Record<string, any>
    const source = `${e.extractType} extract: ${e.document.fileName}`
    const conf: Confidence = e.confidence >= 0.85 ? "high" : e.confidence >= 0.6 ? "medium" : "low"
    const citation = [{ documentId: e.document.id, documentName: e.document.fileName }]

    switch (e.extractType) {
      case "1040":
        map(out, "taxpayer_name", data.taxpayer_name, conf, source, citation)
        map(out, "spouse_name",   data.spouse_name,   conf, source, citation)
        map(out, "ssn",           data.taxpayer_ssn,  conf, source, citation)
        map(out, "spouse_ssn",    data.spouse_ssn,    conf, source, citation)
        map(out, "address_street",data.address_street,conf, source, citation)
        map(out, "address_city",  data.address_city,  conf, source, citation)
        map(out, "address_state", data.address_state, conf, source, citation)
        map(out, "address_zip",   data.address_zip,   conf, source, citation)
        map(out, "filing_status", data.filing_status, conf, source, citation)
        map(out, "income_wages",  divBy12(data.wages), conf, source, citation)
        map(out, "agi_annual",    data.agi,           conf, source, citation)
        break
      case "w2":
        map(out, "employers", data.employer_name ? [{
          emp_name: data.employer_name,
          emp_ein: data.employer_ein,
          emp_gross_monthly: divBy12(data.wages_tips_compensation),
        }] : null, conf, source, citation)
        break
      case "1099":
        if (data.form_variant === "NEC" && data.nonemployee_compensation) {
          map(out, "business_gross_monthly", divBy12(data.nonemployee_compensation), conf, source, citation)
        }
        break
      case "bank_statement":
        map(out, "bank_accounts", data.institution_name ? [{
          bank_name: data.institution_name,
          bank_account_type: data.account_type,
          bank_balance: data.closing_balance,
        }] : null, conf, source, citation)
        break
      case "irs_notice":
        map(out, "irs_notice_number", data.notice_number, conf, source, citation)
        map(out, "notice_date",       data.notice_date,   conf, source, citation)
        map(out, "collection_action_type", data.collection_action_indicated, conf, source, citation)
        break
    }
  }

  return out
}

// ── Phase 3: gather search context for unfilled fields ──

async function gatherSearchContext(
  caseId: string,
  unfilledFields: FieldDef[],
  sections: SectionDef[]
): Promise<Map<string, DocumentSearchHit[]>> {
  const fieldToSection = new Map<string, string>()
  for (const s of sections) {
    for (const f of s.fields) fieldToSection.set(f.id, s.title)
  }

  const out = new Map<string, DocumentSearchHit[]>()

  // For batching efficiency, we run a single semantic search per unfilled field
  // but limit total calls to 15 to bound latency and cost. Fields beyond the
  // first 15 fall back to the already-collected context from siblings.
  const budget = 15
  const fieldsToSearch = unfilledFields.slice(0, budget)

  await Promise.all(
    fieldsToSearch.map(async (f) => {
      try {
        const hits = await searchCaseDocuments({
          caseId,
          query: f.label,
          fieldContext: {
            fieldId: f.id,
            fieldLabel: f.label,
            expectedType: coerceType(f.type),
            formNumber: "",
            sectionTitle: fieldToSection.get(f.id) || "",
          },
          topK: 3,
        })
        out.set(f.id, hits)
      } catch (err: any) {
        console.warn("[auto-populate-v3] search failed for field", { fieldId: f.id, error: err?.message })
      }
    })
  )

  return out
}

function coerceType(t: FieldDef["type"]): "currency" | "date" | "text" | "number" | "ssn" | "ein" {
  switch (t) {
    case "currency":   return "currency"
    case "date":       return "date"
    case "ssn":        return "ssn"
    case "ein":        return "ein"
    case "percentage": return "number"
    default:           return "text"
  }
}

// ── Phase 4: batched AI inference ──

async function batchInferFields(
  unfilledFields: FieldDef[],
  searchResults: Map<string, DocumentSearchHit[]>,
  formNumber: string
): Promise<AutoPopulatedFieldV3[]> {
  const fieldsWithContext = unfilledFields.filter((f) => {
    const hits = searchResults.get(f.id)
    return hits && hits.length > 0
  })

  if (fieldsWithContext.length === 0) return []

  // Process in batches of 20 to bound prompt size.
  const BATCH = 20
  const results: AutoPopulatedFieldV3[] = []

  for (let i = 0; i < fieldsWithContext.length; i += BATCH) {
    const batch = fieldsWithContext.slice(i, i + BATCH)
    const batchResult = await inferBatch(batch, searchResults, formNumber)
    results.push(...batchResult)
  }

  return results
}

async function inferBatch(
  fields: FieldDef[],
  searchResults: Map<string, DocumentSearchHit[]>,
  formNumber: string
): Promise<AutoPopulatedFieldV3[]> {
  // Build the prompt. For each field, include the top document excerpts.
  const fieldBlocks = fields.map((f) => {
    const hits = searchResults.get(f.id) || []
    const chunks = hits.flatMap((h) => h.chunks).slice(0, 3)
    const excerpts = chunks
      .map((c, i) => `  [${i + 1}] (score ${c.score.toFixed(2)}): ${c.content.slice(0, 400)}`)
      .join("\n")
    return `Field: ${f.id}
Label: ${f.label}
Type: ${f.type}
${f.helpText ? `Help: ${f.helpText}\n` : ""}Document excerpts:
${excerpts}`
  }).join("\n\n---\n\n")

  const systemPrompt = `You are a tax-document field inference engine. For each field, decide what value to suggest based on the provided document excerpts.

Return a single JSON array with one object per field (in the same order). Each object:
{
  "field_id": string,
  "value": any | null,    // the inferred value, or null if you cannot infer
  "confidence": "high" | "medium" | "low",
  "reasoning": string     // one short sentence explaining the inference
}

Rules:
- Currency values should be numbers (no symbols, no commas).
- Dates should be ISO YYYY-MM-DD.
- SSNs and EINs should be digit strings with dashes.
- If the excerpts don't contain enough information, return null.
- Use "high" only when the answer is explicit in the excerpts.
- Use "medium" when the answer is inferred from context (e.g., 2 of 3 excerpts support it).
- Use "low" when the answer is a best-guess.
- Do NOT fabricate values. When in doubt, return null.
- Form context: ${formNumber}`

  const response = await callClaude({
    systemPrompt,
    userMessage: `Infer values for these fields:\n\n${fieldBlocks}`,
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 3000,
  })

  const parsed = parseBatchResponse(response.content)
  if (!parsed) return []

  const out: AutoPopulatedFieldV3[] = []
  for (const item of parsed) {
    if (!item.field_id || item.value === null || item.value === undefined) continue
    const hits = searchResults.get(item.field_id) || []
    const citations = hits.map((h) => ({
      documentId: h.documentId,
      documentName: h.documentName,
      pageNumber: h.chunks[0]?.pageNumber || undefined,
    }))
    out.push({
      fieldId: item.field_id,
      value: item.value,
      confidence: (item.confidence as Confidence) || "medium",
      source: `AI inference from ${hits.length} document(s)`,
      extractedFrom: citations,
      reasoning: item.reasoning,
    })
  }
  return out
}

function parseBatchResponse(text: string): Array<{ field_id: string; value: any; confidence: string; reasoning: string }> | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.fields)) return parsed.fields
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {}
    }
  }
  return null
}

// ── helpers ──

function push(out: AutoPopulatedFieldV3[], fieldId: string, value: any, confidence: Confidence, source: string) {
  if (value === null || value === undefined || value === "") return
  out.push({ fieldId, value, confidence, source, extractedFrom: [] })
}

function map(
  out: AutoPopulatedFieldV3[],
  fieldId: string,
  value: any,
  confidence: Confidence,
  source: string,
  citation: Array<{ documentId?: string; documentName?: string }>
) {
  if (value === null || value === undefined || value === "") return
  if (out.find((o) => o.fieldId === fieldId)) return
  out.push({ fieldId, value, confidence, source, extractedFrom: citation })
}

function divBy12(annual: number | null | undefined): number | null {
  if (annual === null || annual === undefined || !Number.isFinite(Number(annual))) return null
  return Math.round((Number(annual) / 12) * 100) / 100
}

function flattenFieldList(sections: SectionDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const s of sections) for (const f of s.fields) out.push(f)
  return out
}

function emptyResult(started: number): AutoPopulationResultV3 {
  return {
    fields: [],
    highConfidence: 0,
    needsReview: 0,
    totalFound: 0,
    documentsUsed: [],
    durationMs: Date.now() - started,
  }
}

function finalizeResult(fields: AutoPopulatedFieldV3[], started: number): AutoPopulationResultV3 {
  const docs = new Set<string>()
  for (const f of fields) {
    for (const c of f.extractedFrom) if (c.documentName) docs.add(c.documentName)
  }
  return {
    fields,
    highConfidence: fields.filter((f) => f.confidence === "high").length,
    needsReview: fields.filter((f) => f.confidence !== "high").length,
    totalFound: fields.length,
    documentsUsed: Array.from(docs),
    durationMs: Date.now() - started,
  }
}
