/**
 * Robust document text extraction.
 *
 * Handles: PDF, DOCX, XLSX, XLS, CSV, TXT, RTF, images (basic OCR placeholder).
 * Each extractor has its own error handling and fallback.
 * Never throws — always returns a string (empty string on total failure).
 *
 * All returned text is passed through `sanitizeForPostgres` so the caller
 * can safely write it to a Postgres text column. PDF extractors (pdf-parse
 * in particular) routinely produce text containing NUL bytes (0x00) and
 * lone UTF-16 surrogate halves; Postgres rejects both with SQLSTATE 22021
 * ("invalid byte sequence for encoding UTF8"). Sanitizing at this boundary
 * means every downstream write path is safe by default.
 */
import { inflateSync } from "zlib"
import { sanitizeForPostgres } from "./sanitize-text"

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
 * Output text is sanitized for safe Postgres storage (NUL bytes, lone
 * surrogates, and other control chars stripped).
 */
export async function extractWithDetails(
  buffer: Buffer,
  fileType: string
): Promise<ExtractionResult> {
  if (!buffer || buffer.length === 0) {
    return { text: "", method: "none", error: "Empty buffer" }
  }

  let raw: ExtractionResult
  try {
    switch (fileType) {
      case "PDF":
        raw = await extractPDF(buffer)
        break
      case "DOCX":
        raw = await extractDOCX(buffer)
        break
      case "XLSX":
        raw = await extractXLSX(buffer)
        break
      case "TEXT":
        raw = extractPlainText(buffer)
        break
      case "IMAGE":
        raw = await extractImageText(buffer)
        break
      default:
        // Try to detect from buffer content
        raw = await extractBySniffing(buffer)
        break
    }
  } catch (err: any) {
    return {
      text: "",
      method: "failed",
      error: `Top-level extraction failed: ${err.message}`,
    }
  }

  // Sanitize at the boundary so every downstream write path is safe.
  // See sanitize-text.ts for the specific characters removed and why.
  return { ...raw, text: sanitizeForPostgres(raw.text) }
}

// ─── PDF ────────────────────────────────────────────────────────

async function extractPDF(buffer: Buffer): Promise<ExtractionResult> {
  const attempts: string[] = []

  // Try pdf-parse first (uses pdfjs-dist, handles most PDFs)
  try {
    const pdfParseModule: any = await import("pdf-parse")
    const pdfParse = pdfParseModule.default || pdfParseModule
    if (typeof pdfParse === "function") {
      const data = await pdfParse(buffer)
      if (data.text && data.text.trim().length > 0) {
        return { text: data.text, method: "pdf-parse" }
      }
      attempts.push("pdf-parse returned empty text")
    }
  } catch (err: any) {
    attempts.push(`pdf-parse error: ${err.message}`)
  }

  // Fallback 1: Extract text from BT/ET markers in raw PDF
  try {
    const text = extractPDFTextObjects(buffer)
    if (text.length > 20) {
      return { text, method: "pdf-text-objects" }
    }
    if (text.length > 0) attempts.push(`BT/ET extraction found only ${text.length} chars`)
  } catch (err: any) {
    attempts.push(`BT/ET extraction error: ${err.message}`)
  }

  // Fallback 2: Decompress FlateDecode streams and extract text
  try {
    const text = extractPDFDecompressedStreams(buffer)
    if (text.length > 20) {
      return { text, method: "pdf-flatedecode" }
    }
    if (text.length > 0) attempts.push(`FlateDecode extraction found only ${text.length} chars`)
  } catch (err: any) {
    attempts.push(`FlateDecode extraction error: ${err.message}`)
  }

  // Fallback 3: Scanned/image-only PDF — attempt OCR
  try {
    const ocrResult = await extractImageText(buffer)
    if (ocrResult.text.length > 20) {
      return { text: ocrResult.text, method: "pdf-ocr" }
    }
    if (ocrResult.text.length > 0) attempts.push(`OCR found only ${ocrResult.text.length} chars`)
    else attempts.push("OCR returned no text")
  } catch (err: any) {
    attempts.push(`OCR error: ${err.message}`)
  }

  console.warn(`[PDF Extract] All methods failed for ${buffer.length} byte PDF. Attempts: ${attempts.join("; ")}`)
  return {
    text: "",
    method: "pdf-failed",
    error: `Could not extract text from PDF (${buffer.length} bytes). Tried: ${attempts.join("; ")}.`,
  }
}

/** Extract text from BT/ET text objects in raw PDF binary */
function extractPDFTextObjects(buffer: Buffer): string {
  const raw = buffer.toString("latin1")
  const textParts: string[] = []

  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g
  let match
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]

    // Parenthesized strings: (Hello World)
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

    // Hex-encoded strings: <48656C6C6F>
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

  return textParts.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Decompress FlateDecode (zlib) streams from PDF and extract readable text.
 * Many bank statements, IRS notices, and financial PDFs use FlateDecode
 * compression that pdf-parse sometimes fails to handle.
 */
function extractPDFDecompressedStreams(buffer: Buffer): string {
  const raw = buffer.toString("latin1")
  const allText: string[] = []

  // Find all stream...endstream blocks
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g
  let match
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamData = match[1]
    // Convert latin1 string back to buffer for decompression
    const streamBuffer = Buffer.from(streamData, "latin1")

    try {
      // Try zlib inflate (FlateDecode)
      const decompressed = inflateSync(streamBuffer)
      const text = decompressed.toString("utf-8")

      // Extract text from BT/ET blocks within decompressed content
      const btText = extractTextFromBTET(text)
      if (btText.length > 0) {
        allText.push(btText)
        continue
      }

      // Also try extracting any readable text content
      const readable = text
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/\s{3,}/g, " ")
        .trim()

      // Filter out PDF operators and short fragments
      if (readable.length > 10 && hasReadableContent(readable)) {
        allText.push(readable)
      }
    } catch {
      // Not zlib compressed — try ASCII85 decode
      try {
        const decoded = decodeASCII85(streamData)
        if (decoded) {
          // Try to inflate the decoded data (ASCII85 + FlateDecode)
          try {
            const decompressed = inflateSync(decoded)
            const text = decompressed.toString("utf-8")
            const btText = extractTextFromBTET(text)
            if (btText.length > 0) {
              allText.push(btText)
              continue
            }
            const readable = text
              .replace(/[^\x20-\x7E\n\r\t]/g, " ")
              .replace(/\s{3,}/g, " ")
              .trim()
            if (readable.length > 10 && hasReadableContent(readable)) {
              allText.push(readable)
            }
          } catch {
            // Decoded but not zlib — try as plain text
            const text = decoded.toString("utf-8")
            const btText = extractTextFromBTET(text)
            if (btText.length > 0) {
              allText.push(btText)
            }
          }
        }
      } catch {
        // Not ASCII85 either — skip this stream
      }
    }
  }

  return allText.join("\n").trim()
}

/** Extract text content from BT/ET operators in decompressed PDF streams */
function extractTextFromBTET(text: string): string {
  const parts: string[] = []
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g
  let match
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1]

    // TJ operator: array of strings and positions [(Hello) -100 (World)] TJ
    const tjRegex = /\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/g
    let tjMatch
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const strRegex = /\(([^)]*)\)/g
      let strMatch
      while ((strMatch = strRegex.exec(tjMatch[1])) !== null) {
        const decoded = decodePDFString(strMatch[1])
        if (decoded.trim()) parts.push(decoded)
      }
    }

    // Tj operator: single string (Hello) Tj
    const singleRegex = /\(([^)]*)\)\s*Tj/g
    let singleMatch
    while ((singleMatch = singleRegex.exec(block)) !== null) {
      const decoded = decodePDFString(singleMatch[1])
      if (decoded.trim()) parts.push(decoded)
    }

    // ' and " operators (show text with newline)
    const primeRegex = /\(([^)]*)\)\s*['"]/g
    let primeMatch
    while ((primeMatch = primeRegex.exec(block)) !== null) {
      const decoded = decodePDFString(primeMatch[1])
      if (decoded.trim()) parts.push(decoded)
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}

/** Check if a string contains meaningful text (not just PDF operators) */
function hasReadableContent(text: string): boolean {
  // Count words (3+ letter sequences)
  const words = text.match(/[a-zA-Z]{3,}/g)
  if (!words || words.length < 3) return false
  // Check ratio of readable words to total length
  const wordChars = words.reduce((sum, w) => sum + w.length, 0)
  return wordChars / text.length > 0.15
}

/** Decode ASCII85 (btoa) encoded data */
function decodeASCII85(data: string): Buffer | null {
  // Find the ASCII85 delimiters <~ and ~>
  const start = data.indexOf("<~")
  const end = data.indexOf("~>")
  const encoded = start >= 0 && end > start
    ? data.substring(start + 2, end)
    : data.trim()

  if (encoded.length < 5) return null

  const result: number[] = []
  let i = 0
  const clean = encoded.replace(/\s/g, "")

  while (i < clean.length) {
    if (clean[i] === "z") {
      result.push(0, 0, 0, 0)
      i++
      continue
    }

    const group: number[] = []
    for (let j = 0; j < 5 && i < clean.length; j++, i++) {
      group.push(clean.charCodeAt(i) - 33)
    }
    while (group.length < 5) group.push(84) // pad with 'u'

    let value = 0
    for (let j = 0; j < 5; j++) {
      value = value * 85 + group[j]
    }

    const bytes = [
      (value >>> 24) & 0xFF,
      (value >>> 16) & 0xFF,
      (value >>> 8) & 0xFF,
      value & 0xFF,
    ]

    // Only push the bytes we actually decoded (handle short final group)
    const numBytes = group.length === 5 ? 4 : group.length - 1
    for (let j = 0; j < numBytes; j++) {
      result.push(bytes[j])
    }
  }

  return Buffer.from(result)
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

// ─── Images (OCR via Tesseract.js) ──────────────────────────────

async function extractImageText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const Tesseract = await import("tesseract.js")
    const { data } = await Tesseract.recognize(buffer, "eng", {
      logger: () => {},  // suppress progress logs
    })
    const text = data.text?.trim() || ""
    if (text.length > 0) {
      return { text, method: "tesseract-ocr" }
    }
    return {
      text: "",
      method: "tesseract-ocr-empty",
      error: "OCR completed but no readable text was found in the image.",
    }
  } catch (err: any) {
    return {
      text: "",
      method: "ocr-failed",
      error: `OCR processing failed: ${err.message}`,
    }
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
    return await extractImageText(buffer)
  }

  // JPEG: starts with \xFF\xD8\xFF
  if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return await extractImageText(buffer)
  }

  // TIFF: starts with II or MM
  if (buffer.length > 4 && ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D))) {
    return await extractImageText(buffer)
  }

  // Default: try as plain text
  return extractPlainText(buffer)
}
