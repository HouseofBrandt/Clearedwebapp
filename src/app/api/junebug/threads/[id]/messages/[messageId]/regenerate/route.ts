import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireJunebugSession, requireOwnedThread } from "@/lib/junebug/thread-access"

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
}
