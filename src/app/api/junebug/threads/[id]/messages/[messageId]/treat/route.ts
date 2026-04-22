import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/db"
import { requireJunebugSession, requireOwnedThread } from "@/lib/junebug/thread-access"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"

/**
 * POST   /api/junebug/threads/[id]/messages/[messageId]/treat
 * DELETE /api/junebug/threads/[id]/messages/[messageId]/treat
 *
 * Practitioner reinforcement signal. POST gives the bone ("good girl"),
 * DELETE takes it back. Idempotent: re-POSTing the same treat is a
 * no-op; DELETE-ing a non-existent treat returns 204.
 *
 * Treats only attach to ASSISTANT messages. USER messages return 400.
 * Treats on errored assistant rows also return 400 — there's no output
 * to reinforce, so storing the signal would pollute the retrospective.
 *
 * The optional `note` field lets practitioners explain what they liked
 * ("finally caught the CSED math error" — that kind of thing), which
 * beats the raw count for teaching Junebug what patterns to repeat.
 */

const postSchema = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
  })
  .optional()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  const auth = await requireJunebugSession()
  if (!auth.ok) return auth.response

  const access = await requireOwnedThread(params.id, auth.userId)
  if (!access.ok) return access.response

  let note: string | undefined
  try {
    const parsed = postSchema.parse(
      await request.json().catch(() => undefined)
    )
    note = parsed?.note
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid body", detail: err?.message },
      { status: 400 }
    )
  }

  try {
    const message = await prisma.junebugMessage.findUnique({
      where: { id: params.messageId },
      select: { id: true, threadId: true, role: true, errorMessage: true },
    })
    if (!message || message.threadId !== params.id) {
      return new NextResponse(null, { status: 404 })
    }
    if (message.role !== "ASSISTANT") {
      return NextResponse.json(
        { error: "Treats can only be given on assistant messages" },
        { status: 400 }
      )
    }
    if (message.errorMessage) {
      return NextResponse.json(
        { error: "Cannot treat an errored message" },
        { status: 400 }
      )
    }

    // Upsert so repeat POSTs are idempotent. If a note is provided on a
    // second POST, it overwrites the first — the practitioner may have
    // wanted to refine what they liked about the response.
    const treat = await prisma.junebugTreat.upsert({
      where: {
        messageId_userId: { messageId: params.messageId, userId: auth.userId },
      },
      create: {
        messageId: params.messageId,
        userId: auth.userId,
        note: note ?? null,
      },
      update: {
        note: note ?? null,
      },
      select: { id: true, createdAt: true, note: true },
    })

    createAuditLog({
      practitionerId: auth.userId,
      action: AUDIT_ACTIONS.JUNEBUG_TREAT_GIVEN,
      metadata: {
        threadId: params.id,
        messageId: params.messageId,
        hasNote: Boolean(note),
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        treat: {
          id: treat.id,
          note: treat.note,
          createdAt: treat.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "junebug/treat/create", junebug: "treat-failed" },
      user: { id: auth.userId },
      extra: { threadId: params.id, messageId: params.messageId },
    })
    return NextResponse.json({ error: "Failed to save treat" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  const auth = await requireJunebugSession()
  if (!auth.ok) return auth.response

  const access = await requireOwnedThread(params.id, auth.userId)
  if (!access.ok) return access.response

  try {
    // Verify the message belongs to the scoped thread. Returns 404 if
    // not — same rule as the ownership check on threads themselves.
    const message = await prisma.junebugMessage.findUnique({
      where: { id: params.messageId },
      select: { threadId: true },
    })
    if (!message || message.threadId !== params.id) {
      return new NextResponse(null, { status: 404 })
    }

    // deleteMany so this is a no-op when no treat exists — matches the
    // idempotent shape of POST. `delete` would 404 on missing.
    const result = await prisma.junebugTreat.deleteMany({
      where: { messageId: params.messageId, userId: auth.userId },
    })

    if (result.count > 0) {
      createAuditLog({
        practitionerId: auth.userId,
        action: AUDIT_ACTIONS.JUNEBUG_TREAT_REVOKED,
        metadata: { threadId: params.id, messageId: params.messageId },
      }).catch(() => {})
    }

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "junebug/treat/revoke", junebug: "treat-failed" },
      user: { id: auth.userId },
      extra: { threadId: params.id, messageId: params.messageId },
    })
    return NextResponse.json({ error: "Failed to remove treat" }, { status: 500 })
  }
}
