import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { getFromS3 } from "@/lib/storage"
import { extractTextFromBuffer } from "@/lib/documents/extract"
import { ingestDocument } from "@/lib/knowledge/ingest"

// Allow up to 5 minutes for large file processing (download from S3 + text extraction + chunking)
export const maxDuration = 300

const MIME_TO_TYPE: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLSX",
  "text/plain": "TEXT",
  "text/csv": "TEXT",
  "text/markdown": "TEXT",
  "application/rtf": "TEXT",
}

function detectFileType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  const extMap: Record<string, string> = {
    pdf: "PDF", docx: "DOCX", doc: "DOCX",
    xlsx: "XLSX", xls: "XLSX", csv: "TEXT",
    txt: "TEXT", md: "TEXT", text: "TEXT", rtf: "TEXT",
  }
  return extMap[ext] || "TEXT"
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { documentId } = await request.json()
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 })
  }

  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: documentId } })
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  if (!doc.s3Key) {
    return NextResponse.json({ error: "No S3 file associated with this document" }, { status: 400 })
  }

  // Mark as processing
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { processingStatus: "processing" },
  })

  try {
    // Download from S3
    const fileSizeMB = (doc.fileSize || 0) / (1024 * 1024)
    console.log(`[KB Process] Downloading ${doc.fileName} (${fileSizeMB.toFixed(1)}MB) from S3: ${doc.s3Key}`)
    const buffer = await getFromS3(doc.s3Key)
    console.log(`[KB Process] Downloaded ${buffer.length} bytes, extracting text...`)
    const fileType = detectFileType(doc.fileName || "file.txt")

    // Extract text and strip null bytes (PostgreSQL rejects \0x00 in text columns)
    const rawText = await extractTextFromBuffer(buffer, fileType)
    const sourceText = rawText.replace(/\0/g, "")
    if (!sourceText || sourceText.trim().length < 10) {
      await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          processingStatus: "failed",
          processingError: "Could not extract sufficient text from this file.",
        },
      })
      return NextResponse.json(
        { error: "Could not extract sufficient text from this file." },
        { status: 400 }
      )
    }

    // Store extracted text
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { sourceText },
    })

    // Chunk and embed
    const result = await ingestDocument(documentId, sourceText)

    // Mark as ready
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: "ready",
        processingError: result.error || null,
      },
    })

    return NextResponse.json({
      id: documentId,
      chunksCreated: result.chunksCreated,
      textLength: sourceText.length,
      warning: result.error,
    })
  } catch (err: any) {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: "failed",
        processingError: err.message,
      },
    })
    return NextResponse.json(
      { error: `Processing failed: ${err.message}` },
      { status: 500 }
    )
  }
}
