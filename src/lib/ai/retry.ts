import Anthropic from "@anthropic-ai/sdk"

/**
 * Shared retry helper for direct `anthropic.messages.create` call sites
 * that aren't routed through callClaude / callClaudeStream.
 *
 * Why this exists: the research + memo pipelines use tool-use loops, so
 * they bypass the `client.ts` helpers and call the SDK directly. Without
 * this, a single transient Anthropic 500 (which is what 429/503/529
 * look like too) kills the whole pipeline — user-reported symptom was:
 *
 *   500 {"type":"error","error":{"type":"api_error",
 *        "message":"Internal server error"},"request_id":"req_..."}
 *
 * With this wrapper, the same request retries 3× with exponential backoff
 * (2s / 4s / 8s) on any 5xx, 429, or 529. Four-way-total attempts covers
 * every transient blip I've seen in practice.
 */

const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [2000, 4000, 8000]

export function isRetryableAnthropicError(error: any): boolean {
  // Timeouts are NOT retryable — the request already spent its budget.
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.message?.includes("timed out")) {
    return false
  }
  const status = error?.status
  return status === 429 || status === 529 || (typeof status === "number" && status >= 500 && status < 600)
}

export interface AnthropicRetryOptions {
  /** Anthropic request body (already built by buildMessagesRequest). */
  body: Anthropic.MessageCreateParamsNonStreaming
  /** Per-call timeout passed to the SDK. */
  timeout?: number
  /** Caller label for log tagging ("conductResearch", "generateMemo", etc). */
  label?: string
  /** Optional progress emit — receives a transient-retry notice so the UI
   *  can tell the user "Anthropic hiccup — retrying" instead of silence. */
  onRetry?: (attempt: number, errorMessage: string) => void
}

/**
 * Call anthropic.messages.create with automatic retry on transient 5xx /
 * 429 / 529 errors. Non-retryable errors (4xx, timeouts) propagate as-is.
 * Timeouts are NOT retried.
 */
export async function createMessageWithRetry(
  anthropic: Anthropic,
  opts: AnthropicRetryOptions
): Promise<Anthropic.Message> {
  const { body, timeout, label = "anthropic", onRetry } = opts

  let lastError: any = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create(body, timeout ? { timeout } : undefined)
    } catch (error: any) {
      lastError = error
      if (attempt < MAX_RETRIES && isRetryableAnthropicError(error)) {
        const wait = RETRY_DELAYS_MS[attempt] ?? 8000
        const status = error?.status
        const msg = error?.message || String(error)
        console.warn(`[${label}] transient ${status || "error"} — retrying in ${wait}ms`, {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          msg: msg.slice(0, 200),
        })
        try { onRetry?.(attempt + 1, msg) } catch { /* never let UI hook fail the call */ }
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      throw error
    }
  }
  throw lastError
}
