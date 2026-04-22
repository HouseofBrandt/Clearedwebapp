import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { getFromS3 } from "@/lib/storage"
import { transcribeAudio, isTranscriptionAvailable } from "@/lib/audio/transcription"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { canAccessCase } from "@/lib/auth/case-access"
import { sanitizeForPostgres } from "@/lib/documents/sanitize-text"

// ─── POST: Transcribe (or re-transcribe) an audio document ──

export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  if (!isTranscriptionAvailable()) {
    return NextResponse.json(
      { error: "Transcription service is not configured. OPENAI_API_KEY is missing." },
      { status: 503 }
    )
  }

  try {
    // Fetch document record
    const document = await prisma.document.findUnique({
      where: { id: params.documentId },
      select: {
        id: true,
        caseId: true,
        fileName: true,
        filePath: true,
        fileType: true,
      },
    })

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Verify case access
    const hasAccess = await canAccessCase(auth.userId, document.caseId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify it's an audio file
    if (document.fileType !== "AUDIO") {
      return NextResponse.json(
        { error: "Document is not an audio file" },
        { status: 400 }
      )
    }

    // Download audio from S3
    const buffer = await getFromS3(document.filePath)

    // Transcribe
    const result = await transcribeAudio(buffer, document.fileName)

    // Update document with transcript. Sanitize to strip NUL bytes /
    // lone surrogates that would otherwise trip Postgres SQLSTATE 22021.
    await prisma.document.update({
      where: { id: document.id },
      data: { extractedText: sanitizeForPostgres(result.text) },
    })

    // Audit log
    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED, // reuse existing action type
      caseId: document.caseId,
      resourceId: document.id,
      resourceType: "Document",
      metadata: {
        action: "audio_transcription",
        language: result.language,
        durationSeconds: result.duration,
        transcriptLength: result.text.length,
      },
      ipAddress: getClientIP(),
    })

    return NextResponse.json({
      documentId: document.id,
      text: result.text,
      language: result.language,
      duration: result.duration,
    })
  } catch (error: any) {
    console.error("[Transcribe] Error:", error)
    return NextResponse.json(
      { error: `Transcription failed: ${error.message}` },
      { status: 500 }
    )
  }
}
