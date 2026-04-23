import Anthropic from "@anthropic-ai/sdk"
import { buildMessagesRequest } from "./model-capabilities"
import { preferredOpusModel, resolveModel } from "./model-selection"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

interface AIRequestOptions {
  systemPrompt: string
  userMessage: string
  model?: string
  /** Ignored for Opus 4.7 (family rejects the param). Preserved for callers
   *  that target earlier models. */
  temperature?: number
  maxTokens?: number
  /** Opus 4.7 only. Ignored for all other models. */
  effort?: "low" | "medium" | "high" | "xhigh"
}

interface AIResponse {
  content: string
  model: string
  requestId: string
  inputTokens: number
  outputTokens: number
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [2000, 4000, 8000]

function isRetryableError(error: any): boolean {
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.message?.includes("timed out")) {
    return false
  }
  const status = error?.status
  return status === 429 || status === 529 || (status >= 500 && status < 600)
}

export function callClaudeStream({
  systemPrompt,
  userMessage,
  model,
  temperature = 0.2,
  maxTokens = 6144,
  effort,
}: AIRequestOptions) {
  const requestId = crypto.randomUUID()
  const resolvedModel = resolveModel(model ?? preferredOpusModel())

  const stream = anthropic.messages.stream(
    buildMessagesRequest({
      model: resolvedModel,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      effort,
    })
  )

  return { stream, requestId }
}

export async function callClaude({
  systemPrompt,
  userMessage,
  model,
  temperature = 0.2,
  maxTokens = 6144,
  effort,
}: AIRequestOptions): Promise<AIResponse> {
  const requestId = crypto.randomUUID()
  const resolvedModel = resolveModel(model ?? preferredOpusModel())
  // Scale timeout with max_tokens: ~1.5s per 100 output tokens, minimum 120s
  const timeoutMs = Math.max(120_000, Math.ceil(maxTokens / 100) * 1500)

  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create(
        buildMessagesRequest({
          model: resolvedModel,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          effort,
        }),
        { timeout: timeoutMs },
      )

      const textContent = response.content.find((c) => c.type === "text")
      const content = textContent ? textContent.text : ""

      return {
        content,
        model: response.model,
        requestId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    } catch (error: any) {
      lastError = error

      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
        continue
      }

      throw error
    }
  }

  throw lastError
}
