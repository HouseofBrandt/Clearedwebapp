/**
 * Robust document text extraction.
 *
 * Handles: PDF, DOCX, XLSX, XLS, CSV, TXT, RTF, images (basic OCR placeholder).
 * Each extractor has its own error handling and fallback.
 * Never throws — always returns a string (empty string on total failure).
 */

export interface ExtractionResult {
  text: string
  method: string   // Which extractor succeeded
  error?: string   // If extraction failed or partially failed
}

/**
 * Primary entry point — extracts text from any supported buffer.
 * NEVER throws. Returns empty string with error details on failure.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const result = await extractWithDetails(buffer, fileType)
  return result.text
}

/**
 * Detailed extraction — returns text plus metadata about how it was extracted.
 */
export async function extractWithDetails(
  buffer: Buffer,
  fileType: string
): Promise<ExtractionResult> {
  if (!buffer || buffer.length === 0) {
    return { text: "", method: "none", error: "Empty buffer" }
  }

  try {
    switch (fileType) {
      case "PDF":
        return await extractPDF(buffer)
      case "DOCX":
        return await extractDOCX(buffer)
      case "XLSX":
        return await extractXLSX(buffer)
      case "TEXT":
        return extractPlainText(buffer)
      case "IMAGE":
        return extractImageText(buffer)
      default:
        // Try to detect from buffer content
        return await extractBySniffing(buffer)
    }
  } catch (err: any) {
    return {
      text: "",
      method: "failed",
      error: `Top-level extraction failed: ${err.message}`,
    }
  }
}

// ─── PDF ────────────────────────────────────────────────────────

async function extractPDF(buffer: Buffer): Promise<ExtractionResult> {
  // Try pdf-parse first
  try {
    const pdfParseModule: any = await import("pdf-parse")
    const pdfParse = pdfParseModule.default || pdfParseModule
    if (typeof pdfParse === "function") {
      const data = await pdfParse(buffer)
      if (data.text && data.text.trim().length > 0) {
        return { text: data.text, method: "pdf-parse" }
      }
    }
  } catch (err: any) {
    console.warn("pdf-parse failed, trying fallback:", err.message)
  }

  // Fallback: extract raw text streams from PDF binary
  try {
    const text = extractPDFRawText(buffer)
    if (text.length > 20) {
      return { text, method: "pdf-fallback" }
    }
  } catch (err: any) {
    console.warn("PDF fallback also failed:", err.message)
  }

  return { text: "", method: "pdf-failed", error: "Could not extract text from PDF. It may be a scanned document requiring OCR." }
}

function extractPDFRawText(buffer: Buffer): string {
  const raw = buffer.toString("latin1")
  const textParts: string[] = []

  // Method 1: Extract text between BT/ET markers (standard PDF text objects)
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g
  let match
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]
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

    // Also try hex-encoded strings <48656C6C6F>
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g
    let hexMatch
    while ((hexMatch = hexRegex.exec(block)) !== null) {
      const hex = hexMatch[1].replace(/\s/g, "")
      if (hex.length >= 4 && hex.length % 2 === 0) {
        let decoded = ""
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16)
          if (code >= 32 && code < 127) decoded += String.fromCharCode(code)
        }
        if (decoded.trim()) textParts.push(decoded)
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join(" ").replace(/\s+/g, " ").trim()
  }

  // Method 2: Look for FlateDecode streams and extract readable text
  const readable = buffer.toString("utf-8", 0, Math.min(buffer.length, 500000))
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{4,}/g, "\n")
    .split("\n")
    .filter(line => line.trim().length > 3)
    .join("\n")
    .trim()

  return readable
}

// ─── DOCX ───────────────────────────────────────────────────────

async function extractDOCX(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    if (result.value && result.value.trim()) {
      return { text: result.value, method: "mammoth" }
    }
    return { text: "", method: "mammoth-empty", error: "DOCX file appears to be empty" }
  } catch (err: any) {
    // If mammoth fails, try treating as ZIP and reading XML directly
    try {
      const text = extractDOCXFallback(buffer)
      if (text.length > 0) {
        return { text, method: "docx-fallback" }
      }
    } catch {
      // ignore fallback failure
    }
    return { text: "", method: "docx-failed", error: `DOCX extraction failed: ${err.message}` }
  }
}

function extractDOCXFallback(buffer: Buffer): string {
  // DOCX is a ZIP containing XML — try to find readable text
  const content = buffer.toString("utf-8")
  const xmlTextRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g
  const parts: string[] = []
  let match
  while ((match = xmlTextRegex.exec(content)) !== null) {
    parts.push(match[1])
  }
  return parts.join(" ")
}

// ─── XLSX / XLS / CSV ───────────────────────────────────────────

async function extractXLSX(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)

    const lines: string[] = []
    workbook.eachSheet((sheet) => {
      lines.push(`=== ${sheet.name} ===`)
      sheet.eachRow((row) => {
        const values = (row.values as any[])
          .slice(1) // ExcelJS rows are 1-indexed
          .map((v) => {
            if (v == null) return ""
            if (typeof v === "object" && v.text) return v.text // hyperlinks
            if (typeof v === "object" && v.result != null) return String(v.result) // formulas
            return String(v)
          })
        lines.push(values.join("\t"))
      })
      lines.push("")
    })

    const text = lines.join("\n").trim()
    if (text.length > 0) {
      return { text, method: "exceljs" }
    }
    return { text: "", method: "exceljs-empty", error: "Spreadsheet appears to be empty" }
  } catch (err: any) {
    // Try CSV fallback
    try {
      const csvText = extractCSV(buffer)
      if (csvText.length > 0) {
        return { text: csvText, method: "csv-fallback" }
      }
    } catch {
      // ignore
    }
    return { text: "", method: "xlsx-failed", error: `Spreadsheet extraction failed: ${err.message}` }
  }
}

function extractCSV(buffer: Buffer): string {
  const text = buffer.toString("utf-8")
  // Verify it looks like CSV (has commas or tabs, multiple lines)
  const lines = text.split("\n").filter(l => l.trim().length > 0)
  if (lines.length < 1) return ""
  const hasDelimiters = lines.some(l => l.includes(",") || l.includes("\t"))
  if (!hasDelimiters && lines.length < 3) return ""
  return text.trim()
}

// ─── Plain Text / RTF ───────────────────────────────────────────

function extractPlainText(buffer: Buffer): ExtractionResult {
  let text = buffer.toString("utf-8")

  // Check if it's actually RTF
  if (text.startsWith("{\\rtf")) {
    text = stripRTF(text)
    return { text, method: "rtf-strip" }
  }

  // Check if it's CSV
  const lines = text.split("\n")
  if (lines.length > 1 && lines[0].includes(",")) {
    return { text, method: "csv-text" }
  }

  return { text: text.trim(), method: "plaintext" }
}

function stripRTF(rtf: string): string {
  // Remove RTF control words and braces, keep text content
  return rtf
    .replace(/\{\\[^{}]*\}/g, "")       // Remove groups with control words
    .replace(/\\[a-z]+\d*\s?/gi, "")    // Remove control words
    .replace(/[{}]/g, "")               // Remove remaining braces
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Images ─────────────────────────────────────────────────────

function extractImageText(buffer: Buffer): ExtractionResult {
  // Tesseract.js is not installed — return a clear message
  // TODO: Add Tesseract.js for OCR when needed
  return {
    text: "",
    method: "image-no-ocr",
    error: "Image files require OCR processing which is not yet configured. Please upload the document as a PDF or text file instead.",
  }
}

// ─── Auto-detect from buffer ────────────────────────────────────

async function extractBySniffing(buffer: Buffer): Promise<ExtractionResult> {
  // PDF: starts with %PDF
  if (buffer.length > 4 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return extractPDF(buffer)
  }

  // ZIP-based formats (DOCX, XLSX): starts with PK\x03\x04
  if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Try XLSX first, then DOCX
    const xlsxResult = await extractXLSX(buffer)
    if (xlsxResult.text.length > 0) return xlsxResult
    const docxResult = await extractDOCX(buffer)
    if (docxResult.text.length > 0) return docxResult
    return { text: "", method: "zip-unknown", error: "ZIP-based file but could not extract as DOCX or XLSX" }
  }

  // PNG: starts with \x89PNG
  if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return extractImageText(buffer)
  }

  // JPEG: starts with \xFF\xD8\xFF
  if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return extractImageText(buffer)
  }

  // TIFF: starts with II or MM
  if (buffer.length > 4 && ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D))) {
    return extractImageText(buffer)
  }

  // Default: try as plain text
  return extractPlainText(buffer)
}
