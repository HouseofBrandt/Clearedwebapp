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
      return ""
  }
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse v2 dynamic import
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (pdfParseModule as any).default || pdfParseModule

    // pdf-parse can be a function directly or have a default export
    if (typeof pdfParse === "function") {
      const data = await pdfParse(buffer)
      return data.text || ""
    }

    // Some versions export differently
    if (typeof pdfParse.default === "function") {
      const data = await pdfParse.default(buffer)
      return data.text || ""
    }

    throw new Error("pdf-parse module loaded but no callable function found")
  } catch (err: any) {
    // Fallback: try to extract text manually from PDF buffer
    // This handles cases where pdf-parse fails on serverless
    console.error("pdf-parse failed, attempting fallback extraction:", err.message)
    return extractPDFTextFallback(buffer)
  }
}

/**
 * Fallback PDF text extraction — reads raw text streams from PDF.
 * Not as good as pdf-parse but works when the library fails.
 */
function extractPDFTextFallback(buffer: Buffer): string {
  const text = buffer.toString("latin1")
  const textParts: string[] = []

  // Extract text between BT (begin text) and ET (end text) markers
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g
  let match
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1]
    // Extract strings in parentheses (PDF text objects)
    const strRegex = /\(([^)]*)\)/g
    let strMatch
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\")
      if (decoded.trim()) {
        textParts.push(decoded)
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join(" ")
  }

  // Last resort: extract any readable ASCII text sequences
  const readable = buffer.toString("utf-8")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{3,}/g, " ")
    .trim()

  return readable.length > 50 ? readable : ""
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
        .slice(1)
        .map((v) => (v != null ? String(v) : ""))
      lines.push(values.join("\t"))
    })
    lines.push("")
  })

  return lines.join("\n")
}
