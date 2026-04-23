/**
 * Rolling summary for long Junebug threads (spec §6.5.1).
 *
 * Strategy:
 *   - Up to 40 messages: no summary; send full history.
 *   - At 40 and every +20 past that (60, 80, …): regenerate a ~300-token
 *     synopsis via Claude Haiku covering every message *except* the last
 *     20, and store it on `JunebugThread.summary`.
 *   - Each completion that sees a non-null summary builds its prompt as:
 *         systemPrompt
 *         + "Earlier in this conversation (summarized):"
 *         + summary
 *         + <last 20 messages>
 *
 * No new schema column is needed: we always re-summarize from scratch,
 * covering [0, messageCount-20). Haiku is cheap and this keeps the
 * invariant simple — the summary is valid iff the thread's messageCount
 * is between (lastSummaryCount) and (lastSummaryCount+20). Misfires
 * just overwrite the same content.
 *
 * Bundle: Anthropic SDK + Prisma + tokenizer. Same lightweight footprint
 * as title-generator.ts.
 */

import Anthropic from "@anthropic-ai/sdk"
import { tokenizeText, detokenizeText } from "@/lib/ai/tokenizer"
import { prisma } from "@/lib/db"
import { buildMessagesRequest } from "@/lib/ai/model-capabilities"
import type { JunebugMessage as CompletionMsg } from "./completion"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

/** Message count at which to first summarize. */
export const SUMMARY_THRESHOLD = 40
/** Number of messages at the tail of the thread that are kept raw. */
export const RAW_TAIL_SIZE = 20
/** Fire a re-summary when count - THRESHOLD is a multiple of this. */
export const SUMMARY_INTERVAL = 20

// Matches the Haiku slug already used in humanizer.ts. If the codebase
// bumps Haiku versions elsewhere, update here too.
const SUMMARY_MODEL = "claude-haiku-4-5-20241022"
const SUMMARY_MAX_TOKENS = 600 // ~300 word synopsis w/ headroom

const SUMMARY_SYSTEM_PROMPT = `You are a concise summarizer for a tax-resolution AI thread.

Produce a compact synopsis of the conversation so far. Keep:
  - the practitioner's core question(s) and goals
  - any case facts the assistant was given (numbers, dates, tax years, entity types)
  - key decisions or recommendations the assistant already made
  - open questions / next steps

Remove:
  - pleasantries, restatements, fluff
  - anything not relevant to future turns

Output 200-300 words, plain prose. No markdown headings, no bullet lists,
no preamble like "Here is a summary". Third-person, past-tense narration
("The practitioner asked about…, the assistant outlined…").`

/**
 * Returns whether a thread at this message count sits exactly on a
 * summary-regeneration boundary (40, 60, 80, …). This is the simple
 * equality check; use `shouldRegenerateSummaryOnTurn` for the
 * post-turn trigger that must handle the fact that turn counts step
 * by 2, and errored rows are excluded from the errorless count so
 * the sequence can skip the exact boundary.
 */
export function shouldRegenerateSummary(messageCount: number): boolean {
  if (messageCount < SUMMARY_THRESHOLD) return false
  const past = messageCount - SUMMARY_THRESHOLD
  return past % SUMMARY_INTERVAL === 0
}

/**
 * Returns whether the current turn crossed a summary-regeneration
 * boundary. The caller passes the errorless message count before this
 * turn and after it; this function answers "did we pass through at
 * least one of 40, 60, 80, … in between?".
 *
 * Why this exists: a turn adds a USER row and an ASSISTANT row. If
 * prior turns produced errored ASSISTANT rows, those are excluded
 * from the errorless count used as `priorCount`, so the sequence
 * becomes ..., 37, 39, 41, 43, ... — skipping 40 entirely. Using
 * equality (`shouldRegenerateSummary(40)`) would never fire, and the
 * thread's prompt would grow unbounded. Boundary-crossing catches it
 * on the 37 → 39 or 39 → 41 step regardless.
 */
export function shouldRegenerateSummaryOnTurn(
  priorCount: number,
  postTurnCount: number
): boolean {
  if (postTurnCount < SUMMARY_THRESHOLD) return false
  const bucketOf = (n: number): number =>
    n < SUMMARY_THRESHOLD
      ? -1
      : Math.floor((n - SUMMARY_THRESHOLD) / SUMMARY_INTERVAL)
  return bucketOf(postTurnCount) > bucketOf(priorCount)
}

/**
 * Load the bounded history a completion should see for a thread.
 * If a summary is present, we truncate to the last RAW_TAIL_SIZE
 * messages and surface the summary separately so the caller can
 * splice it into the system prompt.
 */
export async function loadThreadHistoryForCompletion(
  threadId: string,
  fallbackLimit = 60
): Promise<{
  summary: string | null
  messages: CompletionMsg[]
  totalCount: number
}> {
  const [thread, totalCount] = await Promise.all([
    prisma.junebugThread.findUnique({
      where: { id: threadId },
      select: { summary: true },
    }),
    prisma.junebugMessage.count({
      where: { threadId, errorMessage: null },
    }),
  ])

  const useSummary = thread?.summary && totalCount > SUMMARY_THRESHOLD
  const take = useSummary ? RAW_TAIL_SIZE : fallbackLimit

  const raw = await prisma.junebugMessage.findMany({
    where: { threadId, errorMessage: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { role: true, content: true },
  })
  const messages: CompletionMsg[] = raw
    .reverse()
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }))

  return {
    summary: useSummary ? thread!.summary ?? null : null,
    messages,
    totalCount,
  }
}

/**
 * Generate and persist a rolling summary. Covers every message except
 * the last RAW_TAIL_SIZE. Fire-and-forget — never throws; any failure
 * leaves the prior summary in place (or null on first attempt).
 */
export async function generateAndSaveRollingSummary(
  threadId: string,
  knownNames: string[] = []
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const count = await prisma.junebugMessage.count({
      where: { threadId, errorMessage: null },
    })
    if (count <= SUMMARY_THRESHOLD) return null

    // Load the first (count - RAW_TAIL_SIZE) messages, oldest first.
    const headTake = count - RAW_TAIL_SIZE
    if (headTake <= 0) return null

    const rows = await prisma.junebugMessage.findMany({
      where: { threadId, errorMessage: null },
      orderBy: { createdAt: "asc" },
      take: headTake,
      select: { role: true, content: true },
    })

    // Build a single conversation transcript to hand to Haiku.
    const transcript = rows
      .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
      .map((m) => `${m.role === "USER" ? "Practitioner" : "Assistant"}: ${m.content}`)
      .join("\n\n")

    if (!transcript) return null

    // Tokenize before transmission (same PII discipline as completion).
    const { tokenizedText, tokenMap } = tokenizeText(transcript, knownNames)

    const resp = await anthropic.messages.create(
      buildMessagesRequest({
        model: SUMMARY_MODEL,
        max_tokens: SUMMARY_MAX_TOKENS,
        temperature: 0.2,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: tokenizedText }],
      })
    )

    const raw = resp.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("")
      .trim()

    if (!raw) return null

    const detokenized = Object.keys(tokenMap).length > 0
      ? detokenizeText(raw, tokenMap)
      : raw

    await prisma.junebugThread
      .update({
        where: { id: threadId },
        data: { summary: detokenized },
      })
      .catch(() => {
        /* non-fatal */
      })

    return detokenized
  } catch {
    return null
  }
}
