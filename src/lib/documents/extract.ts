import { getFromS3 } from "@/lib/storage"

/**
 * Extract text from a buffer based on file type.
 * Supports PDF, DOCX, XLSX, and plain text files.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  switch (fileType) {
    case "PDF":
      return extractFromPDF(buffer)
    case "DOCX":
      return extractFromDOCX(buffer)
    case "TEXT":
      return buffer.toString("utf-8")
    case "XLSX":
      return extractFromXLSX(buffer)
    default:
      // For images and unsupported types, return empty
      // (OCR could be added later with Tesseract.js)
      return ""
  }
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import("pdf-parse")
  const pdfParse = (pdfParseModule as any).default || pdfParseModule
  const data = await pdfParse(buffer)
  return data.text
}

async function extractFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function extractFromXLSX(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const lines: string[] = []
  workbook.eachSheet((sheet) => {
    lines.push(`=== ${sheet.name} ===`)
    sheet.eachRow((row) => {
      const values = (row.values as any[])
        .slice(1) // ExcelJS rows are 1-indexed, first element is empty
        .map((v) => (v != null ? String(v) : ""))
      lines.push(values.join("\t"))
    })
    lines.push("")
  })

  return lines.join("\n")
}

/**
 * Extract text from a document stored in S3 (legacy — prefer extractTextFromBuffer).
 */
export async function extractTextFromDocument(
  s3Key: string,
  fileType: string
): Promise<string> {
  const buffer = await getFromS3(s3Key)
  return extractTextFromBuffer(buffer, fileType)
}
