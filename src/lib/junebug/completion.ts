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
 * ## Prompt caching (Anthropic ephemeral cache)
 *
 * The system prompt is split into a STABLE prefix and a VOLATILE
 * suffix. The stable prefix gets `cache_control: { type: "ephemeral" }`
 * so Anthropic caches it for 5 minutes; subsequent turns within the
 * same thread pay ~0.1× for the cached bytes instead of full price.
 * Caching is a prefix match — if the stable block changes, the cache
 * for everything after it invalidates.
 *
 * Callers assemble the two parts themselves:
 *   - stable:   research_assistant_v1 + case context + rolling summary
 *               (changes rarely within a conversation — once per ~20
 *               turns when the summary regenerates)
 *   - volatile: KB search hits for this turn's user message
 *               (changes every turn)
 *
 * A legacy string `systemPrompt` is still accepted — it's treated as a
 * single stable block. Cache activates when the rendered prefix
 * exceeds the model's minimum cacheable length (4096 tokens on Opus
 * 4.6+); below that threshold caching is a silent no-op (no error,
 * just no hits).
 *
 * Bundle: imports only Anthropic SDK (already externalized per
 * next.config.js), `@/lib/ai/tokenizer`, and `@/lib/db`. No transitive
 * pull-in of the tax-authority or Banjo stacks.
 */

import Anthropic from "@anthropic-ai/sdk"
import * as Sentry from "@sentry/nextjs"
import { tokenizeText, detokenizeText } from "@/lib/ai/tokenizer"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

export interface JunebugMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Prompt parts. The stable part is the cacheable prefix; the volatile
 * part (if any) is appended after the cache breakpoint.
 */
export interface SystemPromptParts {
  /** Stable prefix — cached for 5 minutes across turns. */
  stable: string
  /**
   * Volatile suffix — NOT cached. Use for content that changes every
   * turn (e.g. KB hits derived from the current user message).
   * Omit when there's nothing turn-specific.
   */
  volatile?: string
}

export interface RunJunebugCompletionInput {
  /** Full chat history, oldest → newest. User messages will be PII-tokenized before transmission. */
  messages: JunebugMessage[]
  /**
   * Caller-assembled system prompt. Pass `{ stable, volatile? }` to
   * enable prompt caching on the stable portion. A plain string is
   * still accepted and treated as a single stable block.
   */
  systemPrompt: string | SystemPromptParts
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
  /** Anthropic usage.input_tokens — tokens processed at full price (not cached). */
  tokensIn: number
  /** Anthropic usage.output_tokens */
  tokensOut: number
  /**
   * Tokens written to the cache this turn (at ~1.25× cost). Zero on
   * repeat-turn requests that hit the cache. A large non-zero value
   * followed by zero on the next turn is the expected "warm → hot"
   * transition.
   */
  cacheCreationTokens: number
  /**
   * Tokens served from the cache this turn (at ~0.1× cost). If this
   * is zero across repeated turns in the same thread, a silent
   * invalidator is at work — the stable prefix is probably changing
   * turn-to-turn. See `src/app/api/junebug/threads/[id]/messages/
   * route.ts` for the split; any new addition to the stable block
   * that varies per-turn will invalidate.
   */
  cacheReadTokens: number
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
 * Normalize the two accepted systemPrompt shapes into a single
 * SystemPromptParts struct. Keeps the rest of the function clean.
 */
function normalizeSystemPrompt(
  sp: string | SystemPromptParts
): SystemPromptParts {
  if (typeof sp === "string") return { stable: sp }
  return sp
}

/**
 * Build the `system` parameter for the Anthropic call.
 *
 * Structural return — the array shape matches what
 * `anthropic.messages.stream({ system })` accepts. We deliberately
 * don't import the SDK's TextBlockParam type because the exact
 * namespace has moved between SDK minor versions (top-level vs
 * `Messages.TextBlockParam`) and we want this helper to survive a
 * minor-version bump without a type import change.
 *
 * Returns a single cached block when there's no volatile content, or
 * two blocks (stable cached, volatile not cached) when there is.
 * Any change to the volatile block alone does NOT invalidate the
 * stable cache.
 */
function buildSystemBlocks(parts: SystemPromptParts) {
  const blocks: Array<{
    type: "text"
    text: string
    cache_control?: { type: "ephemeral" }
  }> = [
    {
      type: "text",
      text: parts.stable,
      cache_control: { type: "ephemeral" },
    },
  ]
  if (parts.volatile && parts.volatile.length > 0) {
    blocks.push({ type: "text", text: parts.volatile })
  }
  return blocks
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

  const systemParts = normalizeSystemPrompt(input.systemPrompt)
  const systemBlocks = buildSystemBlocks(systemParts)

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
  let cacheCreationTokens = 0
  let cacheReadTokens = 0
  let finalModel = model

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemBlocks,
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
    // Cache usage — exposed on the returned result so the caller can
    // audit hit rate. Anthropic's SDK types these as number | null |
    // undefined depending on whether caching was exercised; coerce.
    cacheCreationTokens = finalMessage.usage?.cache_creation_input_tokens ?? 0
    cacheReadTokens = finalMessage.usage?.cache_read_input_tokens ?? 0

    // Leave a Sentry breadcrumb summarizing cache activity so we can
    // watch hit rate trend in the dashboard without a separate metric
    // pipeline. No PII — just counts.
    Sentry.addBreadcrumb({
      category: "junebug.cache",
      level: "info",
      message: "completion",
      data: {
        model: finalModel,
        tokensIn,
        tokensOut,
        cacheCreationTokens,
        cacheReadTokens,
        hadVolatile: !!systemParts.volatile,
      },
    })

    // Detokenize the full response once, using the final accumulated
    // rawContent (which matches what Claude produced, PII-tokenized).
    detokenizedContent = Object.keys(sessionTokenMap).length > 0
      ? detokenizeText(rawContent, sessionTokenMap)
      : rawContent
  } catch (err: any) {
    const message = err?.message || String(err)

    // Tag every completion failure with `junebug:completion-failed`
    // so the Sentry dashboard can group them. We don't log the user's
    // message content (PII risk) — just counts, model name, timing.
    // The caller already re-captures with threadId/userId; this one
    // is closer to the Anthropic boundary and keeps the stack frame.
    Sentry.captureException(err, {
      tags: {
        source: "junebug/completion",
        junebug: "completion-failed",
        model: finalModel,
      },
      extra: {
        messageCount: apiMessages.length,
        tokenizedNames: knownNames.length,
        partialBytes: rawContent.length,
        hadVolatile: !!systemParts.volatile,
      },
    })

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
    cacheCreationTokens,
    cacheReadTokens,
    durationMs: Date.now() - startedAt,
    model: finalModel,
    tokenMap: sessionTokenMap,
  }

  if (callbacks.onComplete) {
    try { await callbacks.onComplete(result) } catch { /* caller error */ }
  }
  return result
}
