import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { uploadToS3 } from "@/lib/storage"
import { extractTextFromBuffer } from "@/lib/documents/extract"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { randomUUID } from "crypto"

// Allow up to 5 minutes for large file upload + processing
export const maxDuration = 300

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

const VALID_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const

function detectFileType(mimeType: string, fileName: string, buffer: Buffer): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  const mime = (mimeType || "").toLowerCase()

  if (buffer.length > 4) {
    if (buffer.toString("ascii", 0, 5) === "%PDF-") return "PDF"
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
      if (ext === "docx" || ext === "doc" || mime.includes("wordprocessing") || mime.includes("msword")) return "DOCX"
      return "DOCX"
    }
  }

  if (ext === "pdf" || mime.includes("pdf")) return "PDF"
  if (["docx", "doc"].includes(ext) || mime.includes("word")) return "DOCX"
  if (["xlsx", "xls"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
  if (["csv"].includes(ext) || mime.includes("csv")) return "TEXT"
  if (["rtf"].includes(ext) || mime.includes("rtf")) return "TEXT"
  return "TEXT"
}

/**
 * Proxy upload endpoint: receives the file server-side and uploads to S3,
 * bypassing browser CORS restrictions entirely.
 *
 * Flow:
 * 1. Accept multipart FormData with file + metadata
 * 2. Read file into buffer
 * 3. Upload to S3 via server-side SDK (no CORS involved)
 * 4. Extract text and create KnowledgeDocument record
 * 5. Ingest (chunk + embed)
 * 6. Return document ID and chunk count
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string
    const category = formData.get("category") as string
    const description = formData.get("description") as string || ""
    const tagsRaw = formData.get("tags") as string || ""

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!title || !category) {
      return NextResponse.json({ error: "Title and category are required" }, { status: 400 })
    }
    if (!VALID_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 500MB." }, { status: 400 })
    }

    // Read file into buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Detect file type from magic bytes + extension
    const fileType = detectFileType(file.type, file.name, buffer)

    // Generate S3 key
    const ext = file.name.split(".").pop() || "pdf"
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const key = `knowledge/${randomUUID()}-${sanitizedName}`

    // Upload to S3 server-side (no CORS)
    let s3Key: string | null = null
    const s3Configured = !!(process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)

    if (s3Configured) {
      try {
        s3Key = await uploadToS3(key, buffer, file.type || "application/octet-stream")
      } catch (s3Err: any) {
        console.error("[KB Upload] S3 upload failed:", s3Err.message)
        // Continue without S3 - store text only (same as existing FormData fallback)
        s3Key = null
      }
    }

    // Extract text for search/chunking
    // Strip null bytes - PostgreSQL text columns reject \0x00
    const sourceText = (await extractTextFromBuffer(buffer, fileType)).replace(/\0/g, "")

    if (!sourceText || sourceText.trim().length < 10) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from this file. Try uploading a searchable PDF or text file." },
        { status: 400 }
      )
    }

    // Parse tags
    let tags: string[] = []
    if (tagsRaw) {
      try {
        tags = JSON.parse(tagsRaw)
      } catch {
        tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      }
    }

    // Create database record
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        description: description || undefined,
        category: category as any,
        fileName: file.name,
        fileSize: buffer.length,
        s3Key: s3Key || undefined,
        processingStatus: "processing",
        sourceText,
        tags,
        uploadedById: auth.userId,
      },
    })

    // Ingest: chunk and embed
    let result: { chunksCreated: number; error?: string }
    try {
      result = await ingestDocument(doc.id, sourceText)
    } catch (ingestErr: any) {
      console.error("[KB Upload] Ingestion failed:", ingestErr.message)
      // Update status but don't fail the upload
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { processingStatus: "failed", processingError: ingestErr.message },
      })
      result = { chunksCreated: 0, error: ingestErr.message }
    }

    // Mark as ready
    if (!result.error) {
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { processingStatus: "ready", chunkCount: result.chunksCreated },
      })
    }

    // Audit log
    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.KB_DOCUMENT_UPLOADED,
      resourceId: doc.id,
      resourceType: "KnowledgeDocument",
      metadata: { title: doc.title, category, s3Key: s3Key || "none", fileSize: buffer.length },
    })

    return NextResponse.json(
      {
        id: doc.id,
        title: doc.title,
        chunksCreated: result.chunksCreated,
        warning: result.error,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[KB Upload] Error:", error)
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    )
  }
}
