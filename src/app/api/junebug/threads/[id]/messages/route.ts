import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { loadPrompt } from "@/lib/ai/prompts"
import { searchKnowledge } from "@/lib/knowledge/search"
import { getCaseContextPacket, formatContextForPrompt } from "@/lib/switchboard/context-packet"
import { createAuditLog } from "@/lib/ai/audit"
import { requireJunebugSession, requireOwnedThread } from "@/lib/junebug/thread-access"
import { runJunebugCompletion, type JunebugMessage } from "@/lib/junebug/completion"

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
  const caseId = access.thread.caseId
  let contextAvailable = false
  let contextFailureReason: string | null = null
  let systemPrompt = loadPrompt("research_assistant_v1")
  let caseNumber: string | null = null
  let caseType: string | null = null

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
        action: "JUNEBUG_THREAD_CONTEXT_UNAVAILABLE",
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

  // ------------------------------------------------------------------
  // 3. Build chat history. Only the last MESSAGE_HISTORY_LIMIT messages
  //    are sent to Claude (spec §6.5.1 — rolling summary handles longer
  //    threads; PR 4 will wire that). Attachment metadata is attached to
  //    the USER message only as informational text for now — proper
  //    image/file handling is tracked for PR 3.
  // ------------------------------------------------------------------
  const history = await prisma.junebugMessage.findMany({
    where: { threadId: params.id, errorMessage: null },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_HISTORY_LIMIT,
    select: { role: true, content: true },
  })
  const historyMessages: JunebugMessage[] = history
    .reverse()
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
    }))

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
      model: body.model ?? "claude-opus-4-6",
    },
  })

  // Title generation + thread timestamp bump — fire-and-forget, non-blocking.
  // Title generation will be wired in PR 4 (spec §6.5.2). For now we just
  // touch updatedAt / lastMessageAt.
  prisma.junebugThread
    .update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    })
    .catch((e) => console.warn("[Junebug] thread timestamp update failed:", e?.message))

  // Audit (spec §10.3)
  createAuditLog({
    practitionerId: auth.userId,
    caseId,
    action: "JUNEBUG_MESSAGE",
    metadata: {
      threadId: params.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      model: body.model ?? "claude-opus-4-6",
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

      // First event — hand the client both message IDs
      writeEvent("meta", {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        contextAvailable,
      })

      try {
        const result = await runJunebugCompletion(
          {
            messages: historyMessages,
            systemPrompt,
            knownNames,
            model: body.model,
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
      } catch (err: any) {
        const message = err?.message || "AI completion failed"
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
