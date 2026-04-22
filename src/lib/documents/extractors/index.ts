import { prisma } from "@/lib/db"
import { extract1040 } from "./irs-1040"
import { extractW2 } from "./w2"
import { extract1099 } from "./1099"
import { extractBankStatement } from "./bank-statement"
import { extractIRSNotice } from "./irs-notice"

export type DocumentType = "1040" | "w2" | "1099" | "bank_statement" | "irs_notice" | "unknown"

/**
 * Infer the document type from the fileName, documentCategory, and a hint
 * of extracted text. Used to dispatch the right structured extractor.
 *
 * The inference is intentionally simple — a cheap signal for dispatch.
 * The extractor itself will apply Claude to produce structured data.
 */
export function inferDocumentType(input: {
  fileName: string
  documentCategory: string
  extractedText?: string | null
}): DocumentType {
  const name = input.fileName.toLowerCase()
  const cat = input.documentCategory.toLowerCase()
  const text = (input.extractedText || "").slice(0, 500).toLowerCase()

  if (name.includes("1040") || text.includes("form 1040")) return "1040"
  if (name.includes("w-2") || name.includes("w2") || text.includes("wage and tax statement")) return "w2"
  if (name.includes("1099") || text.includes("form 1099")) return "1099"
  if (cat === "bank_statement" || name.includes("statement") || text.includes("account summary")) return "bank_statement"
  if (cat === "irs_notice" || name.startsWith("cp") || text.match(/\b(notice|cp\d{2,3}|lt\d{2,3})\b/)) return "irs_notice"
  return "unknown"
}

/**
 * Dispatch to a type-specific extractor. Writes one DocumentExtract row per
 * successful extraction. Idempotent per (documentId, extractType).
 *
 * Returns the number of extracts written.
 */
export async function extractDocumentFields(documentId: string): Promise<number> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, fileName: true, documentCategory: true, extractedText: true },
  })
  if (!doc || !doc.extractedText) return 0

  const type = inferDocumentType({
    fileName: doc.fileName,
    documentCategory: String(doc.documentCategory),
    extractedText: doc.extractedText,
  })

  let result: { extractedData: any; confidence: number } | null = null

  try {
    switch (type) {
      case "1040":           result = await extract1040(doc.extractedText); break
      case "w2":             result = await extractW2(doc.extractedText); break
      case "1099":           result = await extract1099(doc.extractedText); break
      case "bank_statement": result = await extractBankStatement(doc.extractedText); break
      case "irs_notice":     result = await extractIRSNotice(doc.extractedText); break
      case "unknown":        return 0
    }
  } catch (err: any) {
    console.warn("[documents/extractors] extraction failed", { documentId, type, error: err?.message })
    return 0
  }

  if (!result) return 0

  await prisma.documentExtract.create({
    data: {
      documentId,
      extractType: type,
      extractedData: result.extractedData,
      confidence: result.confidence,
      extractedBy: "claude-sonnet-4-6",
    },
  })

  return 1
}

// Also re-export individual extractors so callers can invoke them directly.
export { extract1040, extractW2, extract1099, extractBankStatement, extractIRSNotice }
