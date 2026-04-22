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
import { buildTreatRetrospective } from "@/lib/junebug/treat-stats"
import {
  loadFullFetchCaseData,
  findCaseByNameOrTabs,
  FULL_FETCH_RESPONSE_RULES,
} from "@/lib/junebug/full-fetch-context"
import {
  getDeploymentSnapshot,
  formatDiagnosticsForPrompt,
  isConfigured as vercelConfigured,
} from "@/lib/vercel/client"

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
  /**
   * Full Fetch "Jarvis" mode — upgrades the model to claude-opus-4-7,
   * raises max_tokens to 16k, and injects the live-case packet
   * (documents with extracted content, liability periods, deadlines,
   * intelligence digest, client notes, AI work products). The model
   * name the client sends is ignored when fullFetch=true — the server
   * pins it to the upgrade slug.
   */
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

// Full Fetch configuration. Pinned server-side so a client can't
// downgrade to a cheap model while falsely flagging Full Fetch to
// unlock the extra context. Model slug tracks CLAUDE.md.
const FULL_FETCH_MODEL = "claude-opus-4-7"
const FULL_FETCH_MAX_TOKENS = 16_384
const FULL_FETCH_TEMPERATURE = 0.2

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
  //
  //    Full Fetch mode layers on top: resolved caseId either comes from
  //    the thread scope OR (on a general thread) from a case reference
  //    detected in the user's current message.
  // ------------------------------------------------------------------
  const isFullFetch = body.fullFetch === true
  let caseId: string | null = access.thread.caseId
  let contextAvailable = false
  let contextFailureReason: string | null = null
  let systemPrompt = loadPrompt("research_assistant_v1")
  let caseNumber: string | null = null
  let caseType: string | null = null
  const fullFetchKnownNames: string[] = []
  let fullFetchLoaded = false
  let fullFetchDetected = false

  if (caseId) {
    try {
      const packet = await getCaseContextPacket(caseId, {
        includeKnowledge: false,
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
  // 1a. Full Fetch — inject the comprehensive live packet.
  //
  // If the thread isn't scoped to a case, try to detect one from the
  // user's message (TABS number or client-name match). This lets a
  // practitioner type "what's the status on Smith?" on a general
  // thread and get Full Fetch context for that case without leaving
  // the workspace.
  // ------------------------------------------------------------------
  if (isFullFetch) {
    if (!caseId) {
      const detected = await findCaseByNameOrTabs(body.content).catch(() => null)
      if (detected) {
        caseId = detected.id
        caseNumber = detected.tabsNumber
        fullFetchDetected = true
        fullFetchKnownNames.push(detected.name)
      }
    }

    if (caseId) {
      try {
        const { data: fullFetchData, knownNames } = await loadFullFetchCaseData(caseId)
        if (fullFetchData) {
          systemPrompt += fullFetchData + FULL_FETCH_RESPONSE_RULES
          fullFetchLoaded = true
          contextAvailable = true
          for (const n of knownNames) {
            if (!fullFetchKnownNames.includes(n)) fullFetchKnownNames.push(n)
          }
        }
      } catch (err: any) {
        console.warn("[Junebug][FullFetch] loadFullFetchCaseData failed:", err?.message)
      }
    }

    // Page diagnostics — browser errors / network failures / current
    // route the practitioner is on. Only injected in Full Fetch mode
    // so normal turns keep a slim system prompt. Schema is duck-typed
    // (anything matching `{ route, title, errors[], networkFailures[] }`)
    // because the client-side BrowserDiagnostics type lives outside
    // the API boundary.
    const pc: any = body.pageContext
    if (pc && typeof pc === "object") {
      const errorLines = Array.isArray(pc.errors) && pc.errors.length > 0
        ? pc.errors
            .slice(-10)
            .map((e: any) =>
              `- [${e.type ?? "error"}] ${String(e.message ?? "").slice(0, 240)}${
                e.source ? ` (${e.source})` : ""
              }`
            )
            .join("\n")
        : "No recent errors."
      const netLines =
        Array.isArray(pc.networkFailures) && pc.networkFailures.length > 0
          ? pc.networkFailures
              .slice(-10)
              .map(
                (f: any) =>
                  `- ${f.method ?? "GET"} ${String(f.url ?? "").slice(0, 200)} → ${f.status ?? 0}`
              )
              .join("\n")
          : "No recent network failures."
      systemPrompt += `

PAGE DIAGNOSTICS (browser state at send time — treat as live):
Route: ${pc.route || body.currentRoute || "unknown"}
Title: ${pc.title || "unknown"}

Recent console errors:
${errorLines}

Recent failed network requests (4xx/5xx/thrown):
${netLines}

When the practitioner asks what's broken on their screen or why a
request failed, ground your answer in the above. If the diagnostics
show no issues, say so plainly instead of speculating.`
    }

    // Vercel deployment + build-log snapshot. Gated on Full Fetch so
    // we don't eat the ~1s round-trip on every turn. `isConfigured()`
    // check avoids calling Vercel at all when the token isn't set, so
    // local dev without VERCEL_API_TOKEN doesn't pay any cost.
    if (vercelConfigured()) {
      try {
        const diag = await getDeploymentSnapshot()
        if (diag) {
          systemPrompt += formatDiagnosticsForPrompt(diag)
        }
      } catch (err: any) {
        console.warn(
          "[Junebug][FullFetch] Vercel diagnostics failed:",
          err?.message
        )
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. Knowledge base retrieval for the user's current message
  // ------------------------------------------------------------------
  let kbHits = 0
  try {
    const results = await searchKnowledge(body.content, { topK: 5, minScore: 0.3 })
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

  // Self-learning retrospective — appends a per-practitioner signal
  // about which past responses earned treats. Soft guidance; never a
  // correctness constraint. See src/lib/junebug/treat-stats.ts.
  try {
    const retrospective = await buildTreatRetrospective(auth.userId)
    if (retrospective.hasSignal) {
      systemPrompt += retrospective.systemPromptBlock
    }
  } catch (err: any) {
    console.warn("[Junebug] treat retrospective failed:", err?.message)
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
  // 4. Load the thread's clientName (decrypted) for tokenizer hints.
  //    Full Fetch's case detection may have already contributed names;
  //    de-dup here so the tokenizer sees each unique string once.
  // ------------------------------------------------------------------
  const knownNames: string[] = [...fullFetchKnownNames]
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
          if (decrypted && !knownNames.includes(decrypted)) {
            knownNames.push(decrypted)
          }
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
    fullFetch: isFullFetch,
    fullFetchLoaded,
    fullFetchDetected,
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

  // Effective model / token ceiling for this turn. Full Fetch pins
  // both server-side — a client can't claim Full Fetch just to unlock
  // the fatter context while requesting a cheap model.
  const effectiveModel = isFullFetch ? FULL_FETCH_MODEL : body.model ?? "claude-opus-4-6"
  const effectiveMaxTokens = isFullFetch ? FULL_FETCH_MAX_TOKENS : undefined
  const effectiveTemperature = isFullFetch ? FULL_FETCH_TEMPERATURE : undefined

  // Reserve the assistant row immediately so the client has its ID in the
  // first SSE event. Content is filled on stream end.
  const assistantMessage = await prisma.junebugMessage.create({
    data: {
      threadId: params.id,
      role: "ASSISTANT",
      content: "", // will be updated on stream end
      model: effectiveModel,
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

  // Audit (spec §10.3). Full Fetch turns get their own action so cost
  // spikes + Sentry rate anomalies are easy to bucket separately.
  // createAuditLog wants `string | undefined` for caseId — coerce since
  // general-scoped threads may have no case id.
  createAuditLog({
    practitionerId: auth.userId,
    caseId: caseId ?? undefined,
    action: isFullFetch
      ? AUDIT_ACTIONS.JUNEBUG_FULL_FETCH_MESSAGE
      : AUDIT_ACTIONS.JUNEBUG_MESSAGE,
    metadata: {
      threadId: params.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      model: effectiveModel,
      contextAvailable,
      kbHits,
      fullFetch: isFullFetch,
      fullFetchLoaded,
      fullFetchDetected,
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

      // First event — hand the client both message IDs + mode flags.
      // Surfacing fullFetch lets the UI render the "Jarvis" chrome
      // state (gold glow on JunebugIcon, token counter) without a
      // second round-trip.
      writeEvent("meta", {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        contextAvailable,
        fullFetch: isFullFetch,
        fullFetchLoaded,
        model: effectiveModel,
      })

      try {
        const result = await runJunebugCompletion(
          {
            messages: historyMessages,
            systemPrompt,
            knownNames,
            model: effectiveModel,
            maxTokens: effectiveMaxTokens,
            temperature: effectiveTemperature,
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
            fullFetch: isFullFetch ? "true" : "false",
          },
          user: { id: auth.userId },
          extra: {
            threadId: params.id,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
            model: effectiveModel,
            kbHits,
            contextAvailable,
            priorMessageCount,
            fullFetchLoaded,
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
