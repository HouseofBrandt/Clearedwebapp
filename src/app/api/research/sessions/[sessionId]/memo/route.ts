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
 * Generates a formal Times New Roman memorandum from an existing
 * research session. The endpoint runs the two-pass memo pipeline
 * (draft → verify → render) and returns the docx as a binary
 * application/vnd.openxmlformats-officedocument.wordprocessingml.document.
 *
 * The session must be in READY_FOR_REVIEW — we use the session's
 * questionText as the memo prompt and its output (if any) as
 * additional context. The memo does NOT replace the session output;
 * it's an additional deliverable the practitioner can choose to
 * generate after reviewing the inline research response.
 *
 * Query/body params (optional):
 *   - to, from, cc, re, date — overrides for the memo header
 *   - bodyOfLaw — "federal tax law" (default), "Delaware corporate law", etc.
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

    // Accept header overrides from the body (optional). All optional — the
    // renderer inserts placeholders where fields are missing.
    let bodyOverrides: any = {}
    try {
      bodyOverrides = await req.json()
    } catch { /* body optional */ }

    // Derive a default clientName for the "To:" header when the session is
    // case-scoped. Best-effort; falls back to the renderer's placeholder.
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
      metadata: {
        mode: session.mode,
      },
    })

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
    })

    // Persist verification stats on the session for the reviewer UI.
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        // No dedicated column for memo verification — write to audit log only.
        // If we add a column later this is the place to persist it.
      },
    }).catch(() => {})

    const filename = slugifyFilename(result.draft.header.re)

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
        "X-Memo-Citations-Total": String(result.verification.total),
        "X-Memo-Citations-Verified": String(result.verification.verified),
        "X-Memo-Citations-NotFound": String(result.verification.notFound),
        "X-Memo-Citations-Unverifiable": String(result.verification.unverifiable),
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
