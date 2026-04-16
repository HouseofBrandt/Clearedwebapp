/**
 * runJunebugCompletion — focused completion helper for Junebug Threads.
 *
 * Spec §10.1 originally asked for a full extraction of `/api/ai/chat`'s
 * body into a shared helper. Per spec §15's push-back trigger, that
 * extraction would duplicate ~80% of the chat route's logic (prompt
 * assembly, Full Fetch mode, attachment handling, web_search tool use,
 * browser-diagnostic injection). Rather than bend the chat route to fit
 * a shared interface, this helper ships as a focused Junebug-side
 * completion — the caller (Junebug routes) does its own prompt
 * assembly, then hands the ready messages to this helper for the
 * actual Claude call + tokenization dance.
 *
 * Follow-up: TODO(refactor) — unify with /api/ai/chat once the Junebug
 * routes stabilize (PR 2+ of spec §14).
 *
 * Bundle: imports only Anthropic SDK (already externalized per
 * next.config.js), `@/lib/ai/tokenizer`, and `@/lib/db`. No transitive
 * pull-in of the tax-authority or Banjo stacks.
 */

import Anthropic from "@anthropic-ai/sdk"
import { tokenizeText, detokenizeText } from "@/lib/ai/tokenizer"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

export interface JunebugMessage {
  role: "user" | "assistant"
  content: string
}

export interface RunJunebugCompletionInput {
  /** Full chat history, oldest → newest. User messages will be PII-tokenized before transmission. */
  messages: JunebugMessage[]
  /** Caller-assembled system prompt. */
  systemPrompt: string
  /** Known PII strings for deterministic tokenization (usually the client name). */
  knownNames?: string[]
  /** Anthropic model slug. Default "claude-opus-4-6". */
  model?: string
  /** Anthropic max_tokens for the response. Default 4096. */
  maxTokens?: number
  /** Anthropic temperature. Default 0.3. */
  temperature?: number
}

export interface RunJunebugCompletionResult {
  /** Detokenized assistant text — safe to show to the practitioner. */
  finalContent: string
  /** Tokenized text as Claude produced it (PII tokens still in place). */
  rawContent: string
  /** Anthropic usage.input_tokens */
  tokensIn: number
  /** Anthropic usage.output_tokens */
  tokensOut: number
  /** Wall-clock ms from request start to stream end. */
  durationMs: number
  /** Model Anthropic actually used (may differ from requested if redirected). */
  model: string
  /** Union of all tokenizer maps built during this turn. Keep private — never return to client. */
  tokenMap: Record<string, string>
}

export interface StreamCallbacks {
  /** Called on every text delta from Claude. Text is ALREADY DETOKENIZED. */
  onDelta?: (text: string) => void | Promise<void>
  /** Called once the stream closes successfully. */
  onComplete?: (result: RunJunebugCompletionResult) => void | Promise<void>
  /** Called if Anthropic throws or the stream fails. Message is sanitized. */
  onError?: (message: string) => void | Promise<void>
}

/**
 * Run a Junebug completion with streaming. Returns the final result on
 * stream end. Throws only for non-recoverable failures (auth, bad params).
 * Anthropic errors mid-stream are surfaced via `onError` and returned as
 * an empty-content result with the error captured in the parent route.
 */
export async function runJunebugCompletion(
  input: RunJunebugCompletionInput,
  callbacks: StreamCallbacks = {}
): Promise<RunJunebugCompletionResult> {
  const startedAt = Date.now()
  const model = input.model || "claude-opus-4-6"
  const maxTokens = input.maxTokens ?? 4096
  const temperature = input.temperature ?? 0.3
  const knownNames = input.knownNames ?? []

  // Build session token map from all user messages. Assistant messages are
  // already detokenized (they came from prior turns), so we don't re-tokenize.
  const sessionTokenMap: Record<string, string> = {}
  const apiMessages = input.messages.map((m) => {
    if (m.role === "user") {
      const { tokenizedText, tokenMap } = tokenizeText(m.content, knownNames)
      Object.assign(sessionTokenMap, tokenMap)
      return { role: "user" as const, content: tokenizedText }
    }
    // Assistant messages were detokenized on their own turn; re-tokenize
    // in case the practitioner's reply or edit reintroduced names.
    const { tokenizedText, tokenMap } = tokenizeText(m.content, knownNames)
    Object.assign(sessionTokenMap, tokenMap)
    return { role: "assistant" as const, content: tokenizedText }
  })

  let rawContent = ""
  let detokenizedContent = ""
  let tokensIn = 0
  let tokensOut = 0
  let finalModel = model

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: input.systemPrompt,
      messages: apiMessages,
    })

    // Accumulate text + forward detokenized deltas to the caller.
    stream.on("text", async (delta: string) => {
      rawContent += delta
      if (callbacks.onDelta) {
        // Detokenize per-delta so the practitioner never sees [NAME-A1B2C3]
        // even mid-stream. If the token map is empty it's a no-op.
        const safeDelta = Object.keys(sessionTokenMap).length > 0
          ? detokenizeText(delta, sessionTokenMap)
          : delta
        try {
          await callbacks.onDelta(safeDelta)
        } catch {
          // Caller error on delta shouldn't abort the stream
        }
      }
    })

    const finalMessage = await stream.finalMessage()
    if (!finalMessage) {
      throw new Error("Claude stream returned no final message")
    }
    finalModel = finalMessage.model || model
    tokensIn = finalMessage.usage?.input_tokens ?? 0
    tokensOut = finalMessage.usage?.output_tokens ?? 0

    // Detokenize the full response once, using the final accumulated
    // rawContent (which matches what Claude produced, PII-tokenized).
    detokenizedContent = Object.keys(sessionTokenMap).length > 0
      ? detokenizeText(rawContent, sessionTokenMap)
      : rawContent
  } catch (err: any) {
    const message = err?.message || String(err)
    if (callbacks.onError) {
      try { await callbacks.onError(message) } catch { /* caller error */ }
    }
    // Best-effort partial return — if some content arrived before the
    // error, keep it. Downstream will mark the message as errored.
    detokenizedContent = Object.keys(sessionTokenMap).length > 0
      ? detokenizeText(rawContent, sessionTokenMap)
      : rawContent
    throw err
  }

  const result: RunJunebugCompletionResult = {
    finalContent: detokenizedContent,
    rawContent,
    tokensIn,
    tokensOut,
    durationMs: Date.now() - startedAt,
    model: finalModel,
    tokenMap: sessionTokenMap,
  }

  if (callbacks.onComplete) {
    try { await callbacks.onComplete(result) } catch { /* caller error */ }
  }
  return result
}
