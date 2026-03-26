// ---------------------------------------------------------------------------
// Auto-Population Engine
//
// Maps extracted document data to IRS form fields. Reads case documents,
// matches them against known field mappings, and returns populated values
// with confidence scores and source attribution.
// ---------------------------------------------------------------------------

export interface AutoPopulatedField {
  fieldId: string
  value: any
  confidence: "high" | "medium" | "low"
  source: { documentId: string; documentName: string; documentType: string }
  extractedFrom: string // description of where in the doc
}

export interface AutoPopulationResult {
  fields: AutoPopulatedField[]
  highConfidence: number
  needsReview: number
  totalFound: number
  documentsUsed: string[]
}

// ---------------------------------------------------------------------------
// Field mapping definitions
//
// Maps document categories/types to form field IDs and the extraction path
// within the parsed document data. Confidence indicates how reliably the
// mapping can be trusted without practitioner review.
// ---------------------------------------------------------------------------

export const FIELD_MAPPINGS: Record<
  string,
  { formField: string; extractPath: string; confidence: "high" | "medium" }[]
> = {
  "W-2": [
    { formField: "employers.emp_name", extractPath: "payer", confidence: "high" },
    { formField: "employers.emp_ein", extractPath: "fields.ein", confidence: "high" },
    { formField: "employers.emp_gross_monthly", extractPath: "fields.wages / 12", confidence: "medium" },
    { formField: "income_wages", extractPath: "fields.wages / 12", confidence: "medium" },
  ],
  "SSA-1099": [
    { formField: "income_ss", extractPath: "fields.net_benefits / 12", confidence: "high" },
  ],
  "1099-R": [
    { formField: "income_pension", extractPath: "fields.gross_distribution / 12", confidence: "medium" },
  ],
  "1099-INT": [
    { formField: "income_interest_dividends", extractPath: "fields.interest / 12", confidence: "high" },
  ],
  "1099-DIV": [
    { formField: "income_interest_dividends", extractPath: "fields.dividends / 12", confidence: "high" },
  ],
  "1099-MISC": [
    { formField: "income_other", extractPath: "fields.nonemployee_compensation / 12", confidence: "medium" },
  ],
  "1099-NEC": [
    { formField: "income_self_employment", extractPath: "fields.nonemployee_compensation / 12", confidence: "medium" },
  ],
  BANK_STATEMENT: [
    { formField: "bank_accounts.bank_name", extractPath: "institution", confidence: "high" },
    { formField: "bank_accounts.bank_balance", extractPath: "balance", confidence: "medium" },
  ],
  TAX_RETURN: [
    { formField: "filing_status", extractPath: "fields.filing_status", confidence: "high" },
    { formField: "dependents_count", extractPath: "fields.dependents", confidence: "high" },
    { formField: "income_wages", extractPath: "fields.wages / 12", confidence: "medium" },
  ],
  IRS_NOTICE: [
    { formField: "total_liability", extractPath: "fields.balance_due", confidence: "medium" },
    { formField: "tax_periods", extractPath: "fields.tax_periods", confidence: "high" },
  ],
}

// ---------------------------------------------------------------------------
// Value extraction helper
// ---------------------------------------------------------------------------

/**
 * Resolves a dotted path against a data object, optionally applying
 * simple arithmetic (e.g., "fields.wages / 12").
 */
function resolveExtractPath(data: Record<string, any>, path: string): any {
  // Check for division expression (e.g., "fields.wages / 12")
  const divMatch = path.match(/^(.+?)\s*\/\s*(\d+)$/)
  const mulMatch = path.match(/^(.+?)\s*\*\s*(\d+)$/)

  let fieldPath = path
  let divisor = 1
  let multiplier = 1

  if (divMatch) {
    fieldPath = divMatch[1].trim()
    divisor = parseInt(divMatch[2], 10)
  } else if (mulMatch) {
    fieldPath = mulMatch[1].trim()
    multiplier = parseInt(mulMatch[2], 10)
  }

  // Traverse dotted path
  const parts = fieldPath.split(".")
  let current: any = data
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    current = current[part]
  }

  if (current === undefined || current === null) return undefined

  // Apply arithmetic if needed
  if (divMatch && typeof current === "number") {
    return Math.round((current / divisor) * 100) / 100
  }
  if (mulMatch && typeof current === "number") {
    return Math.round(current * multiplier * 100) / 100
  }

  return current
}

// ---------------------------------------------------------------------------
// Main auto-population function
// ---------------------------------------------------------------------------

/**
 * Auto-populates form fields by matching case documents against known
 * field mappings. Returns a result with populated fields, confidence
 * scores, and source attribution.
 *
 * @param caseId - The case ID to fetch documents for
 * @param formNumber - The IRS form number (e.g., "433-A")
 * @returns AutoPopulationResult with matched fields
 */
export async function autoPopulateForm(
  caseId: string,
  formNumber: string
): Promise<AutoPopulationResult> {
  // In the future, this will:
  // 1. Fetch all documents for this case via Prisma
  // 2. For each document with extractedData, check FIELD_MAPPINGS
  // 3. Extract values using resolveExtractPath
  // 4. Assign confidence scores
  // 5. Handle conflicts (multiple docs providing same field)

  // For now, return empty result — will be connected to real document extraction
  // once the document processing pipeline populates extractedData on documents
  return {
    fields: [],
    highConfidence: 0,
    needsReview: 0,
    totalFound: 0,
    documentsUsed: [],
  }
}

/**
 * Processes a single document's extracted data against field mappings.
 * Used internally by autoPopulateForm and available for testing.
 */
export function matchDocumentToFields(
  documentId: string,
  documentName: string,
  documentType: string,
  extractedData: Record<string, any>
): AutoPopulatedField[] {
  const mappings = FIELD_MAPPINGS[documentType]
  if (!mappings) return []

  const results: AutoPopulatedField[] = []

  for (const mapping of mappings) {
    const value = resolveExtractPath(extractedData, mapping.extractPath)
    if (value !== undefined && value !== null && value !== "") {
      results.push({
        fieldId: mapping.formField,
        value,
        confidence: mapping.confidence,
        source: { documentId, documentName, documentType },
        extractedFrom: `${documentType} — ${mapping.extractPath}`,
      })
    }
  }

  return results
}
