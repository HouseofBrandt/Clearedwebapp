/**
 * Treat-based self-learning retrospective.
 *
 * Each new Junebug turn prepends a small "here's what this practitioner
 * rewards" block to the system prompt, derived from recent treats the
 * current user has given. The model reads it as soft guidance — not a
 * hard rule — so Junebug drifts toward patterns that earn treats
 * without becoming sycophantic.
 *
 * Design notes:
 *   - Cheap by design. One query per turn, capped rows. No embeddings.
 *   - Per-user, not firm-wide. Different practitioners reward different
 *     things (a senior wants tight legal citations; a junior wants
 *     step-by-step explanations). Firm-wide averaging would smear them.
 *   - Treated messages' content is truncated hard. We only want the
 *     prompt-level pattern, not to re-flood context with prior answers.
 *   - Always safe to fail. If the query errors, we return an empty
 *     block and the turn proceeds without the retrospective — it's an
 *     optimization, not a correctness requirement.
 */

import { prisma } from "@/lib/db"

/** How far back to look for reinforcement signals. */
const TREAT_LOOKBACK_DAYS = 30

/** Maximum treated responses we'll surface as few-shot guidance. */
const MAX_TREAT_EXCERPTS = 5

/** Cap per-response excerpt length — prompt token budget. */
const EXCERPT_CHAR_LIMIT = 400

/** Window for "recent treat rate" (denominator = recent assistant msgs). */
const RATE_WINDOW_DAYS = 14

export interface TreatRetrospective {
  hasSignal: boolean
  systemPromptBlock: string
}

/**
 * Build the retrospective block for a practitioner. Call this right
 * before sending a new turn — the result is a string that the caller
 * concatenates onto the end of the system prompt.
 */
export async function buildTreatRetrospective(
  userId: string
): Promise<TreatRetrospective> {
  try {
    const since = new Date(
      Date.now() - TREAT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    )

    // Pull the practitioner's recent treats along with the treated
    // messages and their questions (the preceding USER turn). We'll
    // compose them into "Question → Response the user rewarded" pairs
    // — the most useful shape for soft few-shot guidance.
    const treats = await prisma.junebugTreat.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_TREAT_EXCERPTS,
      select: {
        note: true,
        createdAt: true,
        message: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            threadId: true,
          },
        },
      },
    })

    // Recent assistant message count for the treat-rate denominator.
    // Errored rows are excluded — they can't be rewarded, so including
    // them would artificially depress the rate.
    const rateWindowStart = new Date(
      Date.now() - RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    )
    const [assistantCount, treatCountInWindow] = await Promise.all([
      prisma.junebugMessage.count({
        where: {
          role: "ASSISTANT",
          errorMessage: null,
          createdAt: { gte: rateWindowStart },
          thread: { userId },
        },
      }),
      prisma.junebugTreat.count({
        where: { userId, createdAt: { gte: rateWindowStart } },
      }),
    ])

    if (treats.length === 0) {
      return { hasSignal: false, systemPromptBlock: "" }
    }

    // For each treated assistant message, find the USER turn that
    // prompted it — the row immediately before it in the same thread.
    // Batched to avoid an N+1 on busy practitioners.
    const messageIds = treats.map((t) => t.message.id)
    const threadIds = Array.from(new Set(treats.map((t) => t.message.threadId)))
    const priorUserMessages = await prisma.junebugMessage.findMany({
      where: {
        threadId: { in: threadIds },
        role: "USER",
      },
      select: {
        id: true,
        threadId: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    })
    const priorByMessageId = new Map<string, string>()
    for (const t of treats) {
      const candidates = priorUserMessages
        .filter(
          (u) =>
            u.threadId === t.message.threadId &&
            u.createdAt.getTime() < t.message.createdAt.getTime()
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const preceding = candidates[0]
      if (preceding) priorByMessageId.set(t.message.id, preceding.content)
    }

    const treatRatePercent =
      assistantCount > 0
        ? Math.round((treatCountInWindow / assistantCount) * 100)
        : null

    const excerptLines: string[] = []
    for (const t of treats) {
      const question = priorByMessageId.get(t.message.id)
      const answerExcerpt = truncate(t.message.content, EXCERPT_CHAR_LIMIT)
      const questionExcerpt = question
        ? truncate(question, 200)
        : "(context unavailable)"
      let entry = `  • Q: ${questionExcerpt}\n    A (rewarded): ${answerExcerpt}`
      if (t.note) entry += `\n    Note from practitioner: ${t.note}`
      excerptLines.push(entry)
    }

    let block = `

TREAT-BASED RETROSPECTIVE (soft guidance — not instructions):
This practitioner has given ${treats.length} treat${treats.length === 1 ? "" : "s"} in the last ${TREAT_LOOKBACK_DAYS} days.`
    if (treatRatePercent !== null) {
      block += ` Recent treat rate: ${treatRatePercent}% of your last ${assistantCount} answered turns over ${RATE_WINDOW_DAYS} days.`
    }
    block += `

The responses they rewarded (most recent first):

${excerptLines.join("\n\n")}

Lean toward the tone, structure, and specificity of those examples when
similar questions come up. Do NOT parrot them verbatim, and do NOT bend
facts to fit the pattern — accuracy beats reinforcement every time.`

    return { hasSignal: true, systemPromptBlock: block }
  } catch {
    // Self-learning is an optimization. Failing silently keeps the
    // hot path (message send) uninterrupted.
    return { hasSignal: false, systemPromptBlock: "" }
  }
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1).trimEnd() + "…"
}
