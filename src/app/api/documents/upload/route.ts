import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { prisma } from "@/lib/db"
import { uploadToS3 } from "@/lib/storage"
import { extractWithDetails } from "@/lib/documents/extract"
import { populateFromTranscript } from "@/lib/documents/liability"
import { autoDetectCategory } from "@/lib/documents/auto-category"
import { triageDocument, processTriageResult } from "@/lib/case-intelligence/document-triage"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { canAccessCase } from "@/lib/auth/case-access"
import { createFeedEvent } from "@/lib/feed/create-event"
import { isAudioMimeType, isAudioExtension, transcribeAudio, isTranscriptionAvailable } from "@/lib/audio/transcription"

/**
 * Detect file type from MIME type, file extension, AND buffer magic bytes.
 * Falls back through all three to ensure correct detection.
 */
function detectFileType(mimeType: string, fileName: string, buffer: Buffer): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  const mime = (mimeType || "").toLowerCase()

  // Check buffer magic bytes first (most reliable)
  if (buffer.length > 4) {
    // PDF
    if (buffer.toString("ascii", 0, 5) === "%PDF-") return "PDF"

    // ZIP-based (DOCX, XLSX, PPTX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      // Distinguish DOCX vs XLSX by extension/mime since both are ZIP
      if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
      if (ext === "docx" || ext === "doc" || mime.includes("wordprocessing") || mime.includes("msword")) return "DOCX"
      // Default ZIP to DOCX (more common in tax resolution)
      return "DOCX"
    }

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "IMAGE"

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "IMAGE"

    // TIFF
    if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D)) return "IMAGE"

    // GIF
    if (buffer.toString("ascii", 0, 3) === "GIF") return "IMAGE"

    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return "IMAGE"
  }

  // Fall back to MIME type
  if (mime === "application/pdf") return "PDF"
  if (mime.startsWith("image/")) return "IMAGE"
  if (isAudioMimeType(mime)) return "AUDIO"
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "DOCX"
  if (mime.includes("spreadsheetml") || mime.includes("excel") || mime.includes("csv")) return "XLSX"
  if (mime === "text/csv") return "XLSX" // CSVs go through the spreadsheet extractor
  if (mime === "application/rtf" || mime === "text/rtf") return "TEXT"
  if (mime.startsWith("text/")) return "TEXT"

  // Fall back to extension
  if (ext === "pdf") return "PDF"
  if (["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "heic"].includes(ext)) return "IMAGE"
  if (isAudioExtension(fileName)) return "AUDIO"
  if (["doc", "docx"].includes(ext)) return "DOCX"
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLSX"
  if (["txt", "text", "rtf", "log", "md"].includes(ext)) return "TEXT"

  // Last resort: check if buffer is valid UTF-8 text
  try {
    const sample = buffer.toString("utf-8", 0, Math.min(buffer.length, 1000))
    const printable = sample.replace(/[^\x20-\x7E\n\r\t]/g, "")
    if (printable.length > sample.length * 0.8) return "TEXT"
  } catch {
    // Not text
  }

  return "TEXT" // Default to TEXT — the extractor will handle it
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateCheck = checkRateLimit((session.user as any).id, "document-upload", RATE_LIMITS.documentUpload)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const caseId = formData.get("caseId") as string | null

    if (!file || !caseId) {
      return NextResponse.json(
        { error: "File and caseId are required" },
        { status: 400 }
      )
    }

    // Verify user has access to this case
    const hasAccess = await canAccessCase((session.user as any).id, caseId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const userCat = (formData.get("documentCategory") as string) || "OTHER"
    const documentCategory = userCat === "OTHER" ? autoDetectCategory(file.name) : userCat

    // Verify case exists
    const caseExists = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, tabsNumber: true } })
    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Read file into buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Detect file type robustly
    const fileType = detectFileType(file.type, file.name, buffer)
    const isAudio = fileType === "AUDIO"

    // Auto-detect category for audio files
    const finalCategory = isAudio && documentCategory === "OTHER"
      ? "MEETING_RECORDING"
      : documentCategory

    // Upload to S3 — use TABS number in path when available
    const uniqueName = `${Date.now()}-${file.name}`
    const prefix = caseExists.tabsNumber
      ? `documents/tabs/${caseExists.tabsNumber}/${caseId}`
      : `documents/${caseId}`
    const s3Key = `${prefix}/${uniqueName}`

    // For audio files, skip text extraction (transcription happens async)
    // For other files, run S3 upload and text extraction in parallel
    let extractedText: string | null = null
    let extractionResult = { text: "", method: "none", error: null as string | null }

    if (isAudio) {
      // Upload only — no text extraction for audio
      await uploadToS3(s3Key, buffer, file.type || "application/octet-stream").catch((err) => {
        console.error("S3 upload failed:", err)
      })
      extractionResult = { text: "", method: "audio-pending-transcription", error: null }
    } else {
      const [, extResult] = await Promise.all([
        uploadToS3(s3Key, buffer, file.type || "application/octet-stream").catch((err) => {
          console.error("S3 upload failed:", err)
          return null
        }),
        extractWithDetails(buffer, fileType),
      ])
      extractionResult = { text: extResult.text, method: extResult.method, error: extResult.error || null }
      extractedText = extractionResult.text.trim() || null
    }

    const document = await prisma.document.create({
      data: {
        caseId,
        fileName: file.name,
        filePath: s3Key,
        fileType: fileType as any,
        fileSize: buffer.length,
        documentCategory: finalCategory as any,
        uploadedById: (session.user as any).id,
        extractedText,
      },
      include: {
        uploadedBy: { select: { name: true } },
      },
    })

    // Fire-and-forget: async audio transcription
    if (isAudio && isTranscriptionAvailable()) {
      transcribeAudio(buffer, file.name)
        .then(async (result) => {
          await prisma.document.update({
            where: { id: document.id },
            data: { extractedText: result.text },
          })
          console.log(`[AudioTranscription] Completed for document ${document.id} (${Math.round(result.duration)}s, ${result.language})`)

          // Trigger triage on the transcript
          if (result.text.length > 50) {
            triageDocument({
              documentId: document.id,
              caseId,
              fileName: document.fileName,
              extractedText: result.text,
              documentCategory: document.documentCategory,
            }).then(triageResult => {
              processTriageResult(triageResult, {
                documentId: document.id,
                caseId,
                fileName: document.fileName,
                userId: (session.user as any).id,
                userName: session.user?.name || "Unknown",
              })
            }).catch(err => {
              console.error("[DocumentTriage] Background triage failed:", err.message)
            })
          }
        })
        .catch((err) => {
          console.error(`[AudioTranscription] Failed for document ${document.id}:`, err.message)
        })
    }

    // Auto-populate LiabilityPeriod from IRS transcripts
    let liabilityPeriodsCreated = 0
    if (extractedText && (finalCategory === "IRS_NOTICE" || finalCategory === "TAX_RETURN")) {
      try {
        liabilityPeriodsCreated = await populateFromTranscript(caseId, extractedText)
      } catch (err: any) {
        console.error("Transcript parsing failed (non-blocking):", err.message)
      }
    }

    // Fire-and-forget: recalculate doc completeness
    recalculateDocCompleteness(caseId).catch(() => {})

    // Fire-and-forget: audit log
    logAudit({
      userId: (session.user as any).id,
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
      caseId,
      resourceId: document.id,
      resourceType: "Document",
      metadata: { fileName: document.fileName, fileSize: buffer.length, fileType, isAudio },
      ipAddress: getClientIP(),
    })

    // Fire-and-forget: AI document triage (non-audio)
    if (!isAudio && extractedText && extractedText.length > 50) {
      triageDocument({
        documentId: document.id,
        caseId,
        fileName: document.fileName,
        extractedText,
        documentCategory: document.documentCategory,
      }).then(result => {
        processTriageResult(result, {
          documentId: document.id,
          caseId,
          fileName: document.fileName,
          userId: (session.user as any).id,
          userName: session.user?.name || "Unknown",
        })
      }).catch(err => {
        console.error("[DocumentTriage] Background triage failed:", err.message)
      })
    }

    // Feed event for document upload
    createFeedEvent({
      eventType: "document_upload",
      caseId,
      eventData: { documents: [{ name: document.fileName, category: document.documentCategory }] },
      content: `1 ${isAudio ? "audio file" : "document"} uploaded`,
    }).catch(() => {})

    return NextResponse.json({
      ...document,
      hasExtractedText: !!extractedText,
      extractedTextLength: extractedText?.length || 0,
      extractionMethod: extractionResult.method,
      extractionError: extractionResult.error || null,
      detectedFileType: fileType,
      liabilityPeriodsCreated,
      isAudio,
      transcriptionPending: isAudio && isTranscriptionAvailable(),
    }, { status: 201 })
  } catch (error: any) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: `Failed to upload file: ${error.message}` },
      { status: 500 }
    )
  }
}
