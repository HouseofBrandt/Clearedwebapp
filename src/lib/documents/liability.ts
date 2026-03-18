/**
 * LiabilityPeriod population utilities.
 *
 * Two sources:
 * 1. IRS transcript parser — extracts structured data from transcript text
 * 2. AI extraction pipeline — uses the tax_liability array from AI output
 */
import { prisma } from "@/lib/db"
import { parseTranscript, parseMultiPeriodTranscript, type TranscriptPeriod } from "./transcript-parser"

/**
 * Parse transcript text and upsert LiabilityPeriod records for the case.
 * Called after document upload when category is IRS_NOTICE or TAX_RETURN.
 */
export async function populateFromTranscript(caseId: string, extractedText: string): Promise<number> {
  // Try multi-period first, fall back to single
  let result = parseMultiPeriodTranscript(extractedText)
  if (result.periods.length === 0) {
    result = parseTranscript(extractedText)
  }

  if (result.periods.length === 0) return 0

  let upserted = 0
  for (const period of result.periods) {
    if (!period.taxYear || period.taxYear < 1990 || period.taxYear > 2100) continue
    await upsertPeriod(caseId, period)
    upserted++
  }

  return upserted
}

/**
 * Populate LiabilityPeriod records from AI extraction output.
 * Expected shape of items in the tax_liability array:
 * {
 *   tax_year: 2022,
 *   form_type: "1040",
 *   original_assessment: 15000,
 *   penalties: 2000,
 *   interest: 500,
 *   total_balance: 17500,
 *   assessment_date: "04-15-2023",
 *   status: "assessed"
 * }
 */
export async function populateFromAIExtraction(
  caseId: string,
  taxLiabilities: any[]
): Promise<number> {
  if (!Array.isArray(taxLiabilities) || taxLiabilities.length === 0) return 0

  let upserted = 0
  for (const item of taxLiabilities) {
    const taxYear = item.tax_year || item.taxYear
    if (!taxYear || taxYear < 1990 || taxYear > 2100) continue

    const formType = item.form_type || item.formType || "1040"

    const period: TranscriptPeriod = {
      taxYear,
      formType,
      filingDate: null,
      transactions: [],
      originalAssessment: parseDecimal(item.original_assessment || item.originalAssessment),
      penalties: parseDecimal(item.penalties),
      interest: parseDecimal(item.interest),
      totalBalance: parseDecimal(item.total_balance || item.totalBalance),
      assessmentDate: item.assessment_date || item.assessmentDate || null,
      csedDate: item.csed_date || item.csedDate || null,
      status: item.status || "assessed",
    }

    await upsertPeriod(caseId, period)
    upserted++
  }

  return upserted
}

/**
 * Upsert a LiabilityPeriod — updates if (caseId, taxYear, formType) already exists,
 * otherwise creates a new record.
 */
async function upsertPeriod(caseId: string, period: TranscriptPeriod) {
  const existing = await prisma.liabilityPeriod.findFirst({
    where: { caseId, taxYear: period.taxYear, formType: period.formType },
  })

  const data = {
    taxYear: period.taxYear,
    formType: period.formType,
    originalAssessment: period.originalAssessment,
    penalties: period.penalties,
    interest: period.interest,
    totalBalance: period.totalBalance,
    assessmentDate: parseDate(period.assessmentDate),
    csedDate: parseDate(period.csedDate),
    status: period.status,
  }

  if (existing) {
    await prisma.liabilityPeriod.update({
      where: { id: existing.id },
      data,
    })
  } else {
    await prisma.liabilityPeriod.create({
      data: { caseId, ...data },
    })
  }
}

function parseDecimal(value: any): number | null {
  if (value == null) return null
  const num = typeof value === "string"
    ? parseFloat(value.replace(/[$,]/g, ""))
    : Number(value)
  return isNaN(num) ? null : num
}

function parseDate(value: any): Date | null {
  if (!value) return null
  const str = String(value)
  // Try MM-DD-YYYY
  const mdyMatch = str.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/)
  if (mdyMatch) {
    return new Date(parseInt(mdyMatch[3]), parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]))
  }
  // Try YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/)
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
  }
  // Try Date.parse as last resort
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}
