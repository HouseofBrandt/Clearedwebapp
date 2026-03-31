/**
 * Auto-populate form fields from the most recent Form 1040 data.
 *
 * When a form field can't be populated from case docs or user input,
 * fall back to the most recent uploaded/extracted Form 1040 for the taxpayer.
 * Auto-filled fields are flagged as sourced from the 1040.
 */
import { prisma } from "@/lib/db"

/** Fields that can be auto-populated from a Form 1040 */
export interface Form1040Fields {
  name?: string
  ssn?: string
  address?: string
  filingStatus?: string
  dependents?: string
  wageIncome?: number
  agi?: number
  withholding?: number
  taxYear?: number
  sourceDocumentId?: string
  sourceDocumentName?: string
}

/** A populated field with provenance metadata */
export interface AutoPopulatedField {
  fieldKey: string
  value: string | number
  source: string // e.g., "TY 2023 Form 1040"
  sourceDocumentId: string
  confidence: "extracted" | "parsed"
}

/**
 * Extract Form 1040 fields from extracted text using regex patterns.
 * These patterns handle common IRS transcript and 1040 formats.
 */
function extract1040Fields(text: string, taxYear?: number): Partial<Form1040Fields> {
  const fields: Partial<Form1040Fields> = {}

  // Filing status
  const filingMatch = text.match(/filing\s*status[:\s]*(single|married\s*filing\s*joint|married\s*filing\s*separate|head\s*of\s*household|qualifying)/i)
  if (filingMatch) {
    const raw = filingMatch[1].toLowerCase()
    if (raw.includes("joint")) fields.filingStatus = "MFJ"
    else if (raw.includes("separate")) fields.filingStatus = "MFS"
    else if (raw.includes("head")) fields.filingStatus = "HOH"
    else if (raw.includes("qualifying")) fields.filingStatus = "QSS"
    else fields.filingStatus = "SINGLE"
  }

  // Wages (Line 1 on 1040)
  const wagePatterns = [
    /wages[,\s]*salaries[,\s]*tips[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /line\s*1[a-z]?\b[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /total\s*wages[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
  ]
  for (const pat of wagePatterns) {
    const m = text.match(pat)
    if (m) {
      fields.wageIncome = parseFloat(m[1].replace(/,/g, ""))
      break
    }
  }

  // AGI (Line 11 on 1040)
  const agiPatterns = [
    /adjusted\s*gross\s*income[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /line\s*11\b[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /\bAGI\b[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
  ]
  for (const pat of agiPatterns) {
    const m = text.match(pat)
    if (m) {
      fields.agi = parseFloat(m[1].replace(/,/g, ""))
      break
    }
  }

  // Withholding (Line 25d on 1040)
  const withholdingPatterns = [
    /(?:federal\s*)?(?:income\s*)?tax\s*withheld[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /withholding[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
    /line\s*25[a-d]?\b[^$\d]*[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
  ]
  for (const pat of withholdingPatterns) {
    const m = text.match(pat)
    if (m) {
      fields.withholding = parseFloat(m[1].replace(/,/g, ""))
      break
    }
  }

  // Dependents
  const depMatch = text.match(/dependents?[:\s]*(\d+)/i)
  if (depMatch) {
    fields.dependents = depMatch[1]
  }

  if (taxYear) fields.taxYear = taxYear

  return fields
}

/**
 * Get auto-populated fields from the most recent Form 1040 for a case.
 *
 * Queries for the most recent TAX_RETURN document with extracted text,
 * extracts known fields, and returns them with source provenance.
 */
export async function getForm1040Fields(
  caseId: string,
  targetTaxYear?: number
): Promise<{ fields: AutoPopulatedField[]; source: { documentId: string; fileName: string; taxYear: number | null } | null }> {
  // Find the most recent TAX_RETURN document with extracted text
  const where: any = {
    caseId,
    documentCategory: "TAX_RETURN",
    extractedText: { not: null },
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      extractedText: true,
      uploadedAt: true,
    },
    take: 5, // Check up to 5 recent tax returns
  })

  if (documents.length === 0) {
    return { fields: [], source: null }
  }

  // Try to find one matching the target tax year, or use the most recent
  let bestDoc = documents[0]
  let bestTaxYear: number | null = null

  for (const doc of documents) {
    if (!doc.extractedText) continue

    // Detect tax year from filename or content
    const yearFromName = doc.fileName.match(/(20\d{2})/)
    const yearFromText = doc.extractedText.match(/tax\s*year[:\s]*(20\d{2})/i)
      || doc.extractedText.match(/form\s*1040[^(]*(20\d{2})/i)

    const year = yearFromName ? parseInt(yearFromName[1]) : yearFromText ? parseInt(yearFromText[1]) : null

    if (targetTaxYear && year === targetTaxYear) {
      bestDoc = doc
      bestTaxYear = year
      break
    }

    if (!bestTaxYear && year) {
      bestDoc = doc
      bestTaxYear = year
    }
  }

  if (!bestDoc.extractedText) {
    return { fields: [], source: null }
  }

  const extracted = extract1040Fields(bestDoc.extractedText, bestTaxYear || undefined)
  const sourceLabel = `TY ${bestTaxYear || "Unknown"} Form 1040`

  const fields: AutoPopulatedField[] = []

  if (extracted.filingStatus) {
    fields.push({
      fieldKey: "filingStatus",
      value: extracted.filingStatus,
      source: sourceLabel,
      sourceDocumentId: bestDoc.id,
      confidence: "extracted",
    })
  }
  if (extracted.wageIncome != null) {
    fields.push({
      fieldKey: "wageIncome",
      value: extracted.wageIncome,
      source: sourceLabel,
      sourceDocumentId: bestDoc.id,
      confidence: "extracted",
    })
  }
  if (extracted.agi != null) {
    fields.push({
      fieldKey: "agi",
      value: extracted.agi,
      source: sourceLabel,
      sourceDocumentId: bestDoc.id,
      confidence: "extracted",
    })
  }
  if (extracted.withholding != null) {
    fields.push({
      fieldKey: "withholding",
      value: extracted.withholding,
      source: sourceLabel,
      sourceDocumentId: bestDoc.id,
      confidence: "extracted",
    })
  }
  if (extracted.dependents) {
    fields.push({
      fieldKey: "dependents",
      value: extracted.dependents,
      source: sourceLabel,
      sourceDocumentId: bestDoc.id,
      confidence: "parsed",
    })
  }

  return {
    fields,
    source: {
      documentId: bestDoc.id,
      fileName: bestDoc.fileName,
      taxYear: bestTaxYear,
    },
  }
}
