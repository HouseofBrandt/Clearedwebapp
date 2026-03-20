import { NextRequest } from "next/server"
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

function sendEvent(controller: ReadableStreamDefaultController, data: Record<string, any>) {
  try {
    controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"))
  } catch {
    // Client disconnected
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { documentId } = body
  if (!documentId) {
    return new Response(JSON.stringify({ error: "documentId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: documentId } })
  if (!doc) {
    return new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }
  if (!doc.s3Key) {
    return new Response(JSON.stringify({ error: "No S3 file associated with this document" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Mark as processing
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { processingStatus: "processing" },
  })

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Phase 1: Download from S3
        const fileSizeMB = (doc.fileSize || 0) / (1024 * 1024)
        sendEvent(controller, { status: "processing", phase: "Downloading file...", percent: 0 })
        console.log(`[KB Process] Downloading ${doc.fileName} (${fileSizeMB.toFixed(1)}MB) from S3: ${doc.s3Key}`)
        const buffer = await getFromS3(doc.s3Key!)
        console.log(`[KB Process] Downloaded ${buffer.length} bytes, extracting text...`)

        // Phase 2: Extract text
        sendEvent(controller, { status: "processing", phase: "Extracting text...", percent: 5 })
        const fileType = detectFileType(doc.fileName || "file.txt")
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
          sendEvent(controller, {
            status: "error",
            error: "Could not extract sufficient text from this file.",
          })
          controller.close()
          return
        }

        sendEvent(controller, { status: "processing", phase: "Saving extracted text...", percent: 10 })

        // Store extracted text
        await prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { sourceText },
        })

        // Phase 3: Chunk and embed (with progress callback)
        const result = await ingestDocument(documentId, sourceText, (progress) => {
          sendEvent(controller, {
            status: "processing",
            phase: progress.detail || progress.phase,
            percent: progress.percent,
          })
        })

        // Mark as ready
        await prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: {
            processingStatus: "ready",
            processingError: result.error || null,
          },
        })

        sendEvent(controller, {
          status: "complete",
          id: documentId,
          chunksCreated: result.chunksCreated,
          embeddedCount: result.embeddedCount,
          textLength: sourceText.length,
          warning: result.error,
          percent: 100,
        })
        controller.close()
      } catch (err: any) {
        await prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: {
            processingStatus: "failed",
            processingError: err.message,
          },
        }).catch(() => {})

        sendEvent(controller, {
          status: "error",
          error: `Processing failed: ${err.message}`,
        })
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
