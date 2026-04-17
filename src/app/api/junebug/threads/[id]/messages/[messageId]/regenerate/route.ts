import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/db"
import { requireJunebugSession, requireOwnedThread } from "@/lib/junebug/thread-access"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"

/**
 * POST /api/junebug/threads/[id]/messages/[messageId]/regenerate (spec §6.7).
 *
 * Deletes the assistant message + everything after it, then the UI re-sends
 * the last USER message via /messages (which handles the streaming).
 *
 * This keeps the regeneration flow simple: the heavy lifting (completion,
 * streaming, persistence) is already in the POST /messages handler. Here
 * we just truncate the thread. The UI calls regenerate → then calls POST
 * /messages to re-run the final USER turn.
 *
 * Validation:
 *   - targetMessage must belong to this thread
 *   - targetMessage.role must be ASSISTANT (spec §6.7 — user messages
 *     cannot be regenerated)
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  const auth = await requireJunebugSession()
  if (!auth.ok) return auth.response

  const access = await requireOwnedThread(params.id, auth.userId)
  if (!access.ok) return access.response

  try {
    // Load the target message + confirm it's in this thread and an ASSISTANT
    const target = await prisma.junebugMessage.findUnique({
      where: { id: params.messageId },
      select: { id: true, threadId: true, role: true, createdAt: true },
    })
    if (!target || target.threadId !== params.id) {
      return new NextResponse(null, { status: 404 })
    }
    if (target.role !== "ASSISTANT") {
      return NextResponse.json(
        { error: "Only ASSISTANT messages can be regenerated" },
        { status: 400 }
      )
    }

    // Delete target + every message created strictly AFTER it. The USER
    // message that prompted this assistant response is NOT deleted —
    // regeneration re-runs the model against that same user turn.
    const deleted = await prisma.junebugMessage.deleteMany({
      where: {
        threadId: params.id,
        createdAt: { gte: target.createdAt },
      },
    })

    // Audit — forensically useful. Regeneration destroys AI output the
    // practitioner may have partially trusted. Log who / when / how many
    // rows disappeared so review-queue investigations can reconstruct.
    createAuditLog({
      practitionerId: auth.userId,
      caseId: access.thread.caseId ?? undefined,
      action: AUDIT_ACTIONS.JUNEBUG_THREAD_REGENERATED,
      metadata: {
        threadId: params.id,
        regeneratedFromMessageId: params.messageId,
        deletedCount: deleted.count,
      },
    }).catch(() => {})

    return NextResponse.json({
      regeneratedFromMessageId: params.messageId,
      deletedCount: deleted.count,
      // Hint to the client: now call POST /messages again to re-run the turn.
      // Spec §6.7 leaves regeneration as a two-step flow so the streaming
      // handler doesn't need to fork.
      next: {
        route: `/api/junebug/threads/${params.id}/messages`,
        method: "POST",
      },
    })
  } catch (err: any) {
    Sentry.captureException(err, {
      tags: { route: "junebug/regenerate", junebug: "regenerate-failed" },
      user: { id: auth.userId },
      extra: { threadId: params.id, messageId: params.messageId },
    })
    return NextResponse.json(
      { error: "Regenerate failed" },
      { status: 500 }
    )
  }
}
