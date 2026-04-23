import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/db"
import { loadPrompt } from "@/lib/ai/prompts"
import { searchKnowledge } from "@/lib/knowledge/search"
import { getCaseContextPacket, formatContextForPrompt } from "@/lib/switchboard/context-packet"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { requireJunebugSession, requireOwnedThread } from "@/lib/junebug/thread-access"
import { runJunebugCompletion, type JunebugMessage } from "@/lib/junebug/completion"
import { findCaseByName } from "@/lib/junebug/case-match"
import { preferredOpusModel } from "@/lib/ai/model-selection"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import {
  loadThreadHistoryForCompletion,
  shouldRegenerateSummaryOnTurn,
  generateAndSaveRollingSummary,
} from "@/lib/junebug/summarize"
import {
  generateAndSaveThreadTitle,
  shouldGenerateTitle,
} from "@/lib/junebug/title-generator"

/**
 * POST /api/junebug/threads/[id]/messages — send a message, stream assistant
 * reply back via Server-Sent Events (spec §6.6).
 *
 * Event shape (matching spec §6.6):
 *   event: meta    {userMessageId, assistantMessageId}
 *   event: delta   {content: string}
 *   event: done    {message, thread}
 *   event: error   {error, assistantMessageId}
 *
 * Persistence: we reserve the assistant message ID before streaming (so the
 * client has a stable id from the first event). On stream end we flush the
 * full content + token counts. On stream failure we flush whatever we have
 * and set errorMessage so the thread never holds a dangling USER message.
 *
 * Bundle note: this route imports searchKnowledge + context-packet + the
 * Junebug completion helper. All three have Prisma as their heaviest import
 * (already in every serverless function bundle). Anthropic SDK is
 * externalized per next.config.js.
 */

export const maxDuration = 120

const MESSAGE_HISTORY_LIMIT = 60

const bodySchema = z.object({
  content: z.string().min(1).max(50_000),
  model: z.string().optional(),
  currentRoute: z.string().optional(),
  pageContext: z.any().optional(),
  /** Full Fetch armed — expands context + raises max_tokens + tries to
   *  auto-detect a case reference in the message body. See completion.ts
   *  for the behavior spec. */
  fullFetch: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        documentId: z.string().cuid().optional(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
      })
    )
    .optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireJunebugSession()
  if (!auth.ok) return auth.response

  const access = await requireOwnedThread(params.id, auth.userId)
  if (!access.ok) return access.response

  // Rate limit: enforce both a sustained-hourly and a burst-per-minute
  // ceiling on AI spend. Both keyed to the user (not thread) so opening
  // multiple threads doesn't expand the budget.
  const hourly = checkRateLimit(auth.userId, "junebug:send:hour", RATE_LIMITS.junebugSend)
  if (!hourly.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        detail: "Too many messages this hour. Please try again later.",
        resetAt: new Date(hourly.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((hourly.resetAt - Date.now()) / 1000))),
          "X-RateLimit-Limit": String(RATE_LIMITS.junebugSend.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(hourly.resetAt / 1000)),
        },
      }
    )
  }
  const burst = checkRateLimit(auth.userId, "junebug:send:burst", RATE_LIMITS.junebugBurst)
  if (!burst.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        detail: "Too many messages this minute. Please slow down.",
        resetAt: new Date(burst.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((burst.resetAt - Date.now()) / 1000))),
          "X-RateLimit-Limit": String(RATE_LIMITS.junebugBurst.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(burst.resetAt / 1000)),
        },
      }
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid body", detail: err?.message },
      { status: 400 }
    )
  }

  // ------------------------------------------------------------------
  // 1. Build case context (if thread is case-scoped). This drives both
  //    the system prompt and the contextSnapshot we persist onto the
  //    USER message for audit (spec §7.6 — practitioner accountability).
  // ------------------------------------------------------------------
  // Resolve the target case. Thread-bound caseId wins. When Full Fetch is
  // armed AND the thread is unscoped, heuristically detect a case from the
  // user's message (TABS number or decrypted client name) and bind the
  // turn (not the thread) to it for the duration of this request.
  // ------------------------------------------------------------------
  let caseId = access.thread.caseId
  let detectedCaseName: string | null = null
  if (!caseId && body.fullFetch) {
    try {
      const detected = await findCaseByName(body.content)
      if (detected) {
        caseId = detected.id
        detectedCaseName = detected.name
      }
    } catch (err: any) {
      console.warn("[Junebug] Full Fetch case-detect failed:", err?.message)
    }
  }

  let contextAvailable = false
  let contextFailureReason: string | null = null
  let systemPrompt = loadPrompt("research_assistant_v1")
  let caseNumber: string | null = null
  let caseType: string | null = null

  if (caseId) {
    try {
      // Full Fetch elevates the context packet: knowledge-base hits pulled
      // against the user's message + full review insights + broader case
      // data. Otherwise we keep the cheaper default (no per-case KB slice,
      // since the KB search below runs on the same message anyway).
      const packet = await getCaseContextPacket(caseId, {
        includeKnowledge: body.fullFetch ?? false,
        knowledgeQuery: body.fullFetch ? body.content : undefined,
        includeReviewInsights: true,
      })
      if (packet) {
        systemPrompt += "\n\n" + formatContextForPrompt(packet)
        contextAvailable = true
        caseNumber = packet.tabsNumber ?? null
        caseType = packet.caseType ?? null
      } else {
        contextFailureReason = "Context packet returned null"
      }
    } catch (ctxErr: any) {
      contextFailureReason = ctxErr?.message || "Context packet loading failed"
    }

    if (!contextAvailable) {
      // A4.1 guardrail — never fabricate case details when context is missing.
      systemPrompt =
        `IMPORTANT: You do NOT have live case data for this conversation. Do not fabricate or guess specific case details like document counts, file names, deadlines, AI task status, or liability amounts. If asked about specific case data, respond: "I don't currently have live case data loaded for this case. I can help with general tax resolution guidance, but for specific case details, please check the case detail page directly."\n\n` +
        systemPrompt

      createAuditLog({
        practitionerId: auth.userId,
        caseId,
        action: AUDIT_ACTIONS.JUNEBUG_THREAD_CONTEXT_UNAVAILABLE,
        metadata: {
          route: "/api/junebug/threads/[id]/messages",
          threadId: params.id,
          reason: contextFailureReason,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => {})
    }
  }

  // ------------------------------------------------------------------
  // 2. Knowledge base retrieval for the user's current message.
  //    Full Fetch widens the net: 10 hits at a lower similarity floor
  //    instead of 5 at the default floor.
  // ------------------------------------------------------------------
  let kbHits = 0
  try {
    const results = await searchKnowledge(body.content, {
      topK: body.fullFetch ? 10 : 5,
      minScore: body.fullFetch ? 0.2 : 0.3,
    })
    if (results.length > 0) {
      kbHits = results.length
      systemPrompt += "\n\nFIRM KNOWLEDGE BASE:\n"
      for (const r of results) {
        systemPrompt += `[${r.documentTitle}${r.sectionHeader ? ` — ${r.sectionHeader}` : ""}]\n`
        systemPrompt += `${r.content}\n\n`
      }
    }
  } catch (err: any) {
    console.warn("[Junebug] KB search failed:", err?.message)
  }

  // ------------------------------------------------------------------
  // 2b. Full Fetch directive — injected into the system prompt so the
  //     model knows the turn is in thorough mode. This is what makes the
  //     armed toggle actually change behavior: it's not a tool gate, it's
  //     a framing + breadth signal the model responds to.
  // ------------------------------------------------------------------
  if (body.fullFetch) {
    systemPrompt += `\n\n=== FULL FETCH MODE (ARMED) ===
The user armed Full Fetch for this turn. Treat this as a "be thorough" signal:
- Use every tool and data source available to you. The knowledge-base block
  above was retrieved with expanded breadth; the case context (if any) was
  loaded with the practitioner's full review insights. Cite specific items
  when they bear on the answer.
- If the user asked about a specific case by name or TABS number and that
  case has been auto-detected${detectedCaseName ? ` (${detectedCaseName})` : ""}, answer from that case's data
  rather than from general principles.
- When you genuinely lack data (e.g. real-time infrastructure, a case that
  isn't loaded), say so clearly and suggest the most specific next action.
  Do NOT pretend Full Fetch gives you live build logs or external services.
- Length budget is expanded — take the space you need for a complete
  answer, but don't pad.`
  }

  // ------------------------------------------------------------------
  // 3. Build chat history. Uses the rolling summary (spec §6.5.1) when
  //    the thread has exceeded SUMMARY_THRESHOLD messages — in that case
  //    we receive the last RAW_TAIL_SIZE messages and a separate
  //    `summary` that gets prepended to the system prompt. Attachment
  //    metadata is attached to the USER message only as informational
  //    text for now — proper image/file handling is tracked separately.
  // ------------------------------------------------------------------
  const historyLoad = await loadThreadHistoryForCompletion(params.id, MESSAGE_HISTORY_LIMIT)
  const historyMessages: JunebugMessage[] = historyLoad.messages
  const priorMessageCount = historyLoad.totalCount

  if (historyLoad.summary) {
    systemPrompt +=
      "\n\nEARLIER IN THIS CONVERSATION (SUMMARIZED):\n" + historyLoad.summary
  }

  // Append the new user message (pre-insert; tokenization happens inside
  // runJunebugCompletion so the DB stores plaintext).
  const attachmentSummary = body.attachments && body.attachments.length > 0
    ? `\n\n[Attached: ${body.attachments.map((a) => a.fileName).join(", ")}]`
    : ""
  const userContent = body.content + attachmentSummary
  historyMessages.push({ role: "user", content: userContent })

  // ------------------------------------------------------------------
  // 4. Load the thread's clientName (decrypted) for tokenizer hints
  // ------------------------------------------------------------------
  let knownNames: string[] = []
  if (caseId) {
    try {
      const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: { clientName: true },
      })
      if (c?.clientName) {
        const { decryptField } = await import("@/lib/encryption")
        try {
          const decrypted = decryptField(c.clientName)
          if (decrypted) knownNames = [decrypted]
        } catch {
          /* decryption failed — proceed without name-based tokenization */
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  // ------------------------------------------------------------------
  // 5. Persist the USER message + reserve the ASSISTANT row
  // ------------------------------------------------------------------
  const contextSnapshot = {
    caseId,
    caseNumber,
    caseType,
    contextAvailable,
    contextFailureReason,
    kbHits,
    currentRoute: body.currentRoute ?? null,
    sentAt: new Date().toISOString(),
  }

  const userMessage = await prisma.junebugMessage.create({
    data: {
      threadId: params.id,
      role: "USER",
      content: userContent,
      contextSnapshot: contextSnapshot as any,
      attachments: body.attachments && body.attachments.length > 0
        ? {
            create: body.attachments.map((a) => ({
              documentId: a.documentId ?? null,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileType: a.fileType,
              fileSize: a.fileSize,
            })),
          }
        : undefined,
    },
    include: { attachments: true },
  })

  // Reserve the assistant row immediately so the client has its ID in the
  // first SSE event. Content is filled on stream end.
  const assistantMessage = await prisma.junebugMessage.create({
    data: {
      threadId: params.id,
      role: "ASSISTANT",
      content: "", // will be updated on stream end
      model: body.model ?? preferredOpusModel(),
    },
  })

  // Thread timestamp bump — fire-and-forget.
  prisma.junebugThread
    .update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    })
    .catch((e) => console.warn("[Junebug] thread timestamp update failed:", e?.message))

  // Title generation (spec §6.5.2) — fire-and-forget the first time a
  // USER message arrives on an auto-generated-title thread. Haiku
  // returns in ~1-2 s; the client sees the updated title on its next
  // thread-list poll. generateAndSaveThreadTitle never throws.
  //
  // `priorMessageCount` is the DB count BEFORE the USER row we just
  // inserted, so "priorUserMessageCount == 0" means "this is the first".
  // We don't re-count USERs specifically — counting any prior message
  // is close enough (empty thread from POST /threads has 0).
  if (shouldGenerateTitle({
    titleAutoGenerated: access.thread.titleAutoGenerated,
    priorUserMessageCount: priorMessageCount,
  })) {
    generateAndSaveThreadTitle(params.id, body.content, knownNames).catch(
      (e) => console.warn("[Junebug] title generation failed:", e?.message)
    )
  }

  // Audit (spec §10.3). createAuditLog wants `string | undefined` for caseId,
  // not `string | null` — coerce since this thread may be general-scoped.
  createAuditLog({
    practitionerId: auth.userId,
    caseId: caseId ?? undefined,
    action: AUDIT_ACTIONS.JUNEBUG_MESSAGE,
    metadata: {
      threadId: params.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      model: body.model ?? preferredOpusModel(),
      contextAvailable,
      kbHits,
    },
  }).catch(() => {})

  // ------------------------------------------------------------------
  // 6. Stream the completion back to the client
  // ------------------------------------------------------------------
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const writeEvent = (event: string, data: Record<string, any>) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          /* client disconnected */
        }
      }

      // First event — hand the client both message IDs. Include fullFetch
      // so the client can reflect the turn's mode in any UI telemetry.
      writeEvent("meta", {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        contextAvailable,
        fullFetch: body.fullFetch ?? false,
      })

      // Audit-log Full Fetch turns for internal visibility (spend signal,
      // usage patterns). Fire-and-forget.
      if (body.fullFetch) {
        createAuditLog({
          practitionerId: auth.userId,
          caseId: caseId ?? undefined,
          action: AUDIT_ACTIONS.JUNEBUG_FULL_FETCH_ARMED,
          metadata: {
            threadId: params.id,
            detectedCaseName: detectedCaseName ?? null,
            contextAvailable,
            kbHits,
            timestamp: new Date().toISOString(),
          },
        }).catch(() => {})
      }

      try {
        const result = await runJunebugCompletion(
          {
            messages: historyMessages,
            systemPrompt,
            knownNames,
            model: body.model,
            fullFetch: body.fullFetch ?? false,
          },
          {
            onDelta: (delta) => {
              writeEvent("delta", { content: delta })
            },
          }
        )

        // Persist the completed assistant message
        const finalAssistant = await prisma.junebugMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: result.finalContent,
            model: result.model,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            durationMs: result.durationMs,
          },
          include: { attachments: true },
        })

        // Bump thread timestamp now (after content lands, so list ordering
        // reflects the actual send time).
        const updatedThread = await prisma.junebugThread.update({
          where: { id: params.id },
          data: { lastMessageAt: new Date() },
        })

        writeEvent("done", {
          message: {
            id: finalAssistant.id,
            role: finalAssistant.role,
            content: finalAssistant.content,
            model: finalAssistant.model,
            tokensIn: finalAssistant.tokensIn,
            tokensOut: finalAssistant.tokensOut,
            durationMs: finalAssistant.durationMs,
            contextSnapshot: finalAssistant.contextSnapshot,
            errorMessage: finalAssistant.errorMessage,
            createdAt: finalAssistant.createdAt.toISOString(),
            attachments: finalAssistant.attachments,
          },
          thread: {
            id: updatedThread.id,
            title: updatedThread.title,
            titleAutoGenerated: updatedThread.titleAutoGenerated,
            lastMessageAt: updatedThread.lastMessageAt.toISOString(),
          },
        })

        // Rolling summary (spec §6.5.1) — fire-and-forget after the
        // stream lands. priorMessageCount is the errorless row count
        // BEFORE this turn; +2 is this turn's USER + ASSISTANT. We
        // use boundary-crossing rather than equality because prior
        // errored rows are excluded from the errorless count and can
        // make the step-by-2 sequence skip 40/60/80 exactly. See
        // shouldRegenerateSummaryOnTurn's docstring for the full
        // reasoning.
        //
        // Never awaited: the response has already reached the client
        // and we don't want to hold the serverless function open past
        // maxDuration for a background Haiku call. The call takes
        // care of its own error handling.
        const postTurnCount = priorMessageCount + 2
        if (shouldRegenerateSummaryOnTurn(priorMessageCount, postTurnCount)) {
          generateAndSaveRollingSummary(params.id, knownNames).catch(
            (e) => console.warn("[Junebug] summary regeneration failed:", e?.message)
          )
        }
      } catch (err: any) {
        const message = err?.message || "AI completion failed"

        // Capture every stream failure with a `junebug` tag + structured
        // context so the dashboard filter "tag:junebug" surfaces them as
        // a single bucket. threadId + userId + assistantMessageId let us
        // triangulate a specific failure without PII in the tag itself.
        Sentry.captureException(err, {
          tags: {
            route: "junebug/messages",
            junebug: "stream-failed",
            caseScoped: caseId ? "true" : "false",
          },
          user: { id: auth.userId },
          extra: {
            threadId: params.id,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
            model: body.model ?? preferredOpusModel(),
            kbHits,
            contextAvailable,
            priorMessageCount,
          },
        })

        // Persist the failure onto the reserved assistant message so the
        // thread never holds a dangling USER message without a reply.
        await prisma.junebugMessage
          .update({
            where: { id: assistantMessage.id },
            data: {
              content: "",
              errorMessage: message.slice(0, 2000),
            },
          })
          .catch(() => {})
        writeEvent("error", { error: message, assistantMessageId: assistantMessage.id })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
