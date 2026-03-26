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
  try {
    const { prisma } = await import("@/lib/db")

    // 1. Fetch all documents for this case with extracted text
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        fileName: true,
        documentCategory: true,
        extractedText: true,
        fileType: true,
      },
    })

    if (!documents.length) {
      return { fields: [], highConfidence: 0, needsReview: 0, totalFound: 0, documentsUsed: [] }
    }

    // 2. Also fetch case data for client info
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        clientName: true,
        filingStatus: true,
        tabsNumber: true,
        liabilityPeriods: {
          select: { taxYear: true, totalBalance: true, penalties: true, interest: true },
        },
      },
    })

    const allFields: AutoPopulatedField[] = []
    const documentsUsed = new Set<string>()

    // 3. Try to populate from case record directly (high confidence)
    if (caseData) {
      // Decrypt client name if available
      try {
        const { decryptField } = await import("@/lib/encryption")
        const clientName = decryptField(caseData.clientName)
        if (clientName && !clientName.includes(":")) {
          allFields.push({
            fieldId: "taxpayer_name",
            value: clientName,
            confidence: "high",
            source: { documentId: "case-record", documentName: "Case Record", documentType: "CASE" },
            extractedFrom: "Client name from case record",
          })
        }
      } catch { /* ignore decryption failures */ }

      // Filing status
      if (caseData.filingStatus) {
        const statusMap: Record<string, string> = {
          SINGLE: "single", MFJ: "married", MFS: "married",
          HOH: "single", QW: "widowed",
        }
        const mapped = statusMap[caseData.filingStatus]
        if (mapped) {
          allFields.push({
            fieldId: "marital_status",
            value: mapped,
            confidence: "medium",
            source: { documentId: "case-record", documentName: "Case Record", documentType: "CASE" },
            extractedFrom: `Filing status: ${caseData.filingStatus}`,
          })
        }
      }

      // Total liability
      if (caseData.liabilityPeriods?.length) {
        const totalBalance = caseData.liabilityPeriods.reduce(
          (sum: number, lp: any) => sum + (Number(lp.totalBalance) || 0), 0
        )
        if (totalBalance > 0) {
          allFields.push({
            fieldId: "total_liability",
            value: totalBalance,
            confidence: "high",
            source: { documentId: "case-record", documentName: "Case Record", documentType: "CASE" },
            extractedFrom: `Sum of ${caseData.liabilityPeriods.length} liability periods`,
          })
          documentsUsed.add("Case Record")
        }
      }
    }

    // 4. Process each document's extracted text for structured data
    for (const doc of documents) {
      if (!doc.extractedText) continue

      // Try to parse extractedText as JSON (some docs have structured extraction)
      let structuredData: Record<string, any> | null = null
      try {
        const parsed = JSON.parse(doc.extractedText)
        if (typeof parsed === "object" && parsed !== null) {
          structuredData = parsed
        }
      } catch {
        // Not JSON — try text-based extraction below
      }

      // Map document category to our mapping keys
      const categoryToType: Record<string, string> = {
        BANK_STATEMENT: "BANK_STATEMENT",
        TAX_RETURN: "TAX_RETURN",
        IRS_NOTICE: "IRS_NOTICE",
        PAYROLL: "W-2",
        MEETING_NOTES: "MEETING_NOTES",
      }

      if (structuredData) {
        // If we have wage_income forms (from transcript parser)
        if (structuredData.wage_income?.forms) {
          for (const form of structuredData.wage_income.forms) {
            const matched = matchDocumentToFields(doc.id, doc.fileName, form.type, form)
            allFields.push(...matched)
            if (matched.length > 0) documentsUsed.add(doc.fileName)
          }
        }

        // If we have account data
        if (structuredData.account) {
          if (structuredData.account.balance) {
            allFields.push({
              fieldId: "total_liability",
              value: Math.abs(structuredData.account.balance),
              confidence: "medium",
              source: { documentId: doc.id, documentName: doc.fileName, documentType: "ACCOUNT_TRANSCRIPT" },
              extractedFrom: "Account transcript balance",
            })
            documentsUsed.add(doc.fileName)
          }
        }

        // Direct category mapping
        const mappingKey = categoryToType[doc.documentCategory] || doc.documentCategory
        const mapped = matchDocumentToFields(doc.id, doc.fileName, mappingKey, structuredData)
        if (mapped.length > 0) {
          allFields.push(...mapped)
          documentsUsed.add(doc.fileName)
        }
      }

      // Text-based extraction for common patterns
      const text = doc.extractedText
      if (text && text.length > 20 && !structuredData) {
        // Extract dollar amounts near keywords
        const patterns: { pattern: RegExp; fieldId: string; confidence: "high" | "medium" }[] = [
          { pattern: /total\s+(?:assessed?\s+)?(?:balance|liability|due)[:\s]*\$?([\d,]+\.?\d*)/i, fieldId: "total_liability", confidence: "medium" },
          { pattern: /(?:gross|total)\s+(?:monthly\s+)?(?:wages?|salary|income|pay)[:\s]*\$?([\d,]+\.?\d*)/i, fieldId: "income_wages", confidence: "medium" },
          { pattern: /social\s+security[:\s]*\$?([\d,]+\.?\d*)/i, fieldId: "income_ss", confidence: "medium" },
          { pattern: /(?:rent|mortgage)\s+(?:payment)?[:\s]*\$?([\d,]+\.?\d*)/i, fieldId: "expense_housing", confidence: "medium" },
        ]

        for (const { pattern, fieldId, confidence } of patterns) {
          const match = text.match(pattern)
          if (match) {
            const value = parseFloat(match[1].replace(/,/g, ""))
            if (value > 0 && value < 10000000) {
              allFields.push({
                fieldId,
                value,
                confidence,
                source: { documentId: doc.id, documentName: doc.fileName, documentType: doc.documentCategory },
                extractedFrom: `Text extraction: "${match[0].slice(0, 50)}"`,
              })
              documentsUsed.add(doc.fileName)
            }
          }
        }
      }
    }

    // 5. Deduplicate — keep highest confidence per field
    const fieldMap = new Map<string, AutoPopulatedField>()
    for (const field of allFields) {
      const existing = fieldMap.get(field.fieldId)
      if (!existing || confidenceRank(field.confidence) > confidenceRank(existing.confidence)) {
        fieldMap.set(field.fieldId, field)
      }
    }

    const dedupedFields = Array.from(fieldMap.values())
    const highCount = dedupedFields.filter(f => f.confidence === "high").length
    const reviewCount = dedupedFields.filter(f => f.confidence === "medium" || f.confidence === "low").length

    return {
      fields: dedupedFields,
      highConfidence: highCount,
      needsReview: reviewCount,
      totalFound: dedupedFields.length,
      documentsUsed: Array.from(documentsUsed),
    }
  } catch (error) {
    console.error("Auto-populate error:", error)
    return { fields: [], highConfidence: 0, needsReview: 0, totalFound: 0, documentsUsed: [] }
  }
}

function confidenceRank(c: "high" | "medium" | "low"): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1
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
