import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { completeJunebugPlaceholder } from "@/lib/feed/junebug-reply"
import { z } from "zod"

/**
 * POST /api/feed/[postId]/junebug-complete
 * ----------------------------------------
 * Completes a Junebug placeholder reply by running the AI synchronously
 * and updating the placeholder with the result.
 *
 * Why this exists as a separate endpoint:
 *   The feed POST handler (POST /api/feed) has no `maxDuration` set and
 *   defaults to Vercel's platform limit (~10s on Hobby). Fire-and-forgetting
 *   the AI call from there gets the lambda killed before the Anthropic
 *   response comes back, so the placeholder stays stuck in "thinking"
 *   state forever.
 *
 *   This endpoint runs in its OWN lambda with `maxDuration = 60`, awaits
 *   the AI call synchronously, and updates the placeholder before
 *   returning. The client fires it as a separate HTTP request after the
 *   original POST succeeds — giving Junebug a full 60s of budget.
 *
 * The endpoint is idempotent: if the placeholder was already completed
 * (e.g. by a duplicate trigger), it no-ops and returns the existing reply.
 */

// Give the AI plenty of room — the agent loop can easily chain
// several tool calls and each round is a full Anthropic API request.
export const maxDuration = 60

const schema = z.object({
  placeholderId: z.string().min(1),
  message: z.string().min(1).max(10000),
  caseId: z.string().nullable().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { placeholderId, message, caseId } = parsed.data

  // Confirm the placeholder belongs to this post, is a junebug reply, and
  // hasn't been completed already. Prevents cross-post spoofing and
  // duplicate work.
  const placeholder = await prisma.feedReply.findUnique({
    where: { id: placeholderId },
    select: {
      id: true,
      postId: true,
      authorType: true,
      content: true,
    },
  })

  if (!placeholder) {
    return NextResponse.json({ error: "Placeholder not found" }, { status: 404 })
  }
  if (placeholder.postId !== params.postId) {
    return NextResponse.json(
      { error: "Placeholder does not belong to this post" },
      { status: 400 }
    )
  }
  if (placeholder.authorType !== "junebug") {
    return NextResponse.json(
      { error: "Placeholder is not a Junebug reply" },
      { status: 400 }
    )
  }

  // Idempotent: if already completed, return the existing reply.
  if (placeholder.content !== null) {
    const existing = await prisma.feedReply.findUnique({
      where: { id: placeholderId },
      include: { author: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ reply: existing, alreadyCompleted: true })
  }

  // Run the AI synchronously — this endpoint's `maxDuration = 60` gives
  // us the budget we need. completeJunebugPlaceholder handles timeout,
  // error fallback, and the final DB update internally.
  await completeJunebugPlaceholder(placeholderId, message, caseId ?? null)

  const updated = await prisma.feedReply.findUnique({
    where: { id: placeholderId },
    include: { author: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ reply: updated, alreadyCompleted: false })
}
