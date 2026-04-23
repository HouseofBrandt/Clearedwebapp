import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { generateMemo } from "@/lib/research/memo-generator"
import { decryptField } from "@/lib/encryption"

export const maxDuration = 600

/**
 * POST /api/research/sessions/[sessionId]/memo
 *
 * Streams a Claude-style progress display over SSE as the two-pass memo
 * pipeline runs (draft → verify → revise → render), then delivers the
 * final .docx as a base64 payload on a terminal `done` event.
 *
 * Why SSE instead of returning a binary blob? The memo pipeline can take
 * 30–120 seconds. A silent POST is indistinguishable from a hung
 * request. Streaming per-step events lets the UI render a progress bar
 * + detail line the whole way through.
 *
 * Stream protocol (one JSON object per `data: ...\n\n` event):
 *   { type: "phase", phase: "drafting"|"verifying"|"revising"|"rendering"|"complete",
 *     headline, percent }
 *   { type: "detail", detail }
 *   { type: "verify_citation", citation, status }
 *   { type: "done", filename, docxBase64, verification }
 *   { type: "error", error }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params

    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        case: { select: { caseType: true, clientName: true } },
        createdBy: { select: { name: true, email: true } },
      },
    })

    if (!session) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    let bodyOverrides: any = {}
    try {
      bodyOverrides = await req.json()
    } catch { /* body optional */ }

    let clientName = ""
    if (session.case) {
      try {
        clientName = decryptField(session.case.clientName) || ""
      } catch { /* fallthrough */ }
    }
    const authorName = session.createdBy?.name || ""

    logAudit({
      userId: auth.userId,
      action: "RESEARCH_MEMO_GENERATED",
      caseId: session.caseId ?? undefined,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: { mode: session.mode },
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch { /* client disconnected */ }
        }

        try {
          const result = await generateMemo({
            prompt: session.questionText,
            context: session.output || undefined,
            header: {
              to: bodyOverrides?.to || clientName || undefined,
              from: bodyOverrides?.from || authorName || undefined,
              cc: bodyOverrides?.cc,
              re: bodyOverrides?.re,
              date: bodyOverrides?.date,
              letterhead: bodyOverrides?.letterhead,
            },
            bodyOfLaw: bodyOverrides?.bodyOfLaw,
            onProgress: (event) => {
              if (event.kind === "phase") {
                send({
                  type: "phase",
                  phase: event.phase,
                  headline: event.headline,
                  percent: event.percent,
                })
              } else if (event.kind === "verify_citation") {
                const verb = event.status === "started" ? "Verifying" : (
                  event.status === "verified" ? "Verified" :
                  event.status === "superseded" ? "Superseded" : "Could not verify"
                )
                send({ type: "detail", detail: `${verb} ${truncateCite(event.citation)}` })
                send({ type: "verify_citation", citation: event.citation, status: event.status })
              } else if (event.kind === "detail") {
                send({ type: "detail", detail: event.detail })
              } else if (event.kind === "revise_flagged") {
                send({
                  type: "detail",
                  detail: `${event.count} citation${event.count === 1 ? "" : "s"} failed verification — asking Claude to revise`,
                })
              }
            },
          })

          const filename = slugifyFilename(result.draft.header.re)
          send({
            type: "done",
            filename: `${filename}.docx`,
            docxBase64: result.buffer.toString("base64"),
            verification: result.verification,
          })
        } catch (err: any) {
          console.error("[Research Memo SSE] error:", err?.message || err)
          send({ type: "error", error: err?.message || String(err) })
        }

        try { controller.close() } catch {}
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("[Research Memo] POST error:", error?.message || error)
    return NextResponse.json(
      { error: "Failed to generate memo", detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

function slugifyFilename(input: string): string {
  const base = (input || "memo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `memo-${base || "research"}`.slice(0, 100)
}

function truncateCite(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim()
  return trimmed.length > 64 ? trimmed.slice(0, 61) + "…" : trimmed
}
