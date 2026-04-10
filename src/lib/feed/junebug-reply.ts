import { prisma } from "@/lib/db"
import { runJunebug } from "@/lib/junebug/runtime"

/**
 * Junebug feed-reply helpers.
 *
 * The flow is intentionally split into two steps because of how Vercel
 * serverless functions behave:
 *
 *   1. createJunebugPlaceholder — a fast DB write that happens INSIDE the
 *      POST /api/feed (or POST /api/feed/[postId]/reply) handler while the
 *      caller is still waiting. This guarantees the "thinking" reply shows
 *      up in the feed immediately after the post is created.
 *
 *   2. completeJunebugPlaceholder — a slow AI call (10–30 s with tool
 *      loops) that MUST run in its own lambda invocation so it doesn't get
 *      killed when the POST handler returns. It's invoked by a dedicated
 *      endpoint (POST /api/feed/[postId]/junebug-complete) that has
 *      `maxDuration = 60` set on the route.
 *
 * The old `generateJunebugReply(postId, message, caseId)` entry point is
 * kept as a compatibility wrapper so existing callers keep working, but
 * nothing in the hot path fire-and-forgets anymore.
 */

// ── 1. Create placeholder (fast, safe to await in POST handler) ──

/**
 * Insert a placeholder reply with `content: null`. The feed UI already
 * interprets null as the Junebug "thinking" state, so the moment this
 * returns, the practitioner sees the bouncing-dots indicator.
 *
 * Increments `feedPost.replyCount` inside the same transaction so the
 * UI badge updates atomically.
 */
export async function createJunebugPlaceholder(postId: string): Promise<string> {
  const [reply] = await prisma.$transaction([
    prisma.feedReply.create({
      data: {
        postId,
        authorType: "junebug",
        content: null,
      },
      select: { id: true },
    }),
    prisma.feedPost.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
      select: { id: true },
    }),
  ])
  return reply.id
}

// ── 2. Complete placeholder (slow, must run in its own lambda) ──

/**
 * Run the Junebug agent and write the result into an existing placeholder.
 * Must be called from a handler with `export const maxDuration = 60` so
 * Vercel gives the AI call enough budget to finish.
 *
 * Guarantees:
 *   - If runJunebug returns normally, the placeholder is filled with its text
 *   - If runJunebug throws, a friendly error message is written instead
 *   - If runJunebug exceeds `timeoutMs`, we race it and write a timeout
 *     message (so the placeholder never stays stuck in thinking state)
 *   - Every failure branch still attempts the DB update — if even that
 *     fails, we log and return; the stale-placeholder sweeper (below)
 *     will clean it up on the next feed GET.
 */
export async function completeJunebugPlaceholder(
  placeholderId: string,
  userMessage: string,
  caseId?: string | null,
  timeoutMs = 55_000
): Promise<void> {
  // Defensive: confirm the placeholder still exists AND is still in
  // thinking state. Protects against duplicate trigger calls racing.
  const existing = await prisma.feedReply.findUnique({
    where: { id: placeholderId },
    select: { id: true, content: true, authorType: true },
  }).catch(() => null)

  if (!existing) {
    console.warn("[JunebugReply] placeholder missing:", placeholderId)
    return
  }
  if (existing.authorType !== "junebug") {
    console.warn("[JunebugReply] placeholder is not a junebug reply:", placeholderId)
    return
  }
  if (existing.content !== null) {
    // Another trigger already completed it — idempotent no-op.
    return
  }

  let finalText: string
  try {
    // Race the AI call against a hard timeout so a hung tool loop can't
    // leave the placeholder stuck. The 55s limit leaves 5s of budget for
    // the DB update before the 60s maxDuration kills the lambda.
    const result = await Promise.race([
      runJunebug({
        surface: "feed",
        userId: "system",
        message: userMessage,
        caseId: caseId || undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Junebug generation exceeded timeout")),
          timeoutMs
        )
      ),
    ])
    finalText = result.text?.trim() || "I came up empty on that one — try rephrasing?"
  } catch (err: any) {
    console.error("[JunebugReply] generation failed:", err?.message || err)
    finalText =
      "Sorry, I tripped over my own paws on that one. Try tagging me again?"
  }

  try {
    await prisma.feedReply.update({
      where: { id: placeholderId },
      data: { content: finalText },
    })
  } catch (err: any) {
    console.error("[JunebugReply] failed to update placeholder:", err?.message || err)
  }
}

// ── 3. Stale-placeholder sweeper (called from feed GET) ─────────

/**
 * Any Junebug placeholder older than this is considered stale — the
 * completion lambda must have been killed, timed out, or never invoked.
 * The feed GET calls `sweepStalePlaceholders` so users don't see an
 * eternal thinking spinner on the next page load.
 */
const STALE_PLACEHOLDER_MINUTES = 3

export async function sweepStalePlaceholders(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PLACEHOLDER_MINUTES * 60 * 1000)
  try {
    const result = await prisma.feedReply.updateMany({
      where: {
        authorType: "junebug",
        content: null,
        createdAt: { lt: cutoff },
      },
      data: {
        content:
          "Sorry, I timed out thinking about that. Try tagging me again?",
      },
    })
    return result.count
  } catch (err: any) {
    console.warn("[JunebugReply] sweep failed:", err?.message)
    return 0
  }
}

// ── 4. Backwards compatibility ──────────────────────────────────

/**
 * Legacy entry point that chains create + complete. Kept so any code that
 * still calls `generateJunebugReply` keeps compiling, but new callers
 * should split into createJunebugPlaceholder + completeJunebugPlaceholder
 * so the slow AI call runs in its own lambda.
 */
export async function generateJunebugReply(
  postId: string,
  userMessage: string,
  caseId?: string | null
): Promise<string> {
  const placeholderId = await createJunebugPlaceholder(postId)
  await completeJunebugPlaceholder(placeholderId, userMessage, caseId)
  return placeholderId
}
