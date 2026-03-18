import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

interface AIRequestOptions {
  systemPrompt: string
  userMessage: string
  model?: string
  temperature?: number
  maxTokens?: number
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
  // Don't retry timeouts — if a request timed out once, retrying wastes minutes
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.message?.includes("timed out")) {
    return false
  }
  const status = error?.status
  return status === 429 || status === 529 || (status >= 500 && status < 600)
}

/**
 * Streaming variant — returns a MessageStream that emits chunks as they arrive.
 * Use this to keep HTTP connections alive past Vercel's 60s time-to-first-byte limit.
 * The stream emits text_delta events; collect them to build the full response.
 */
export function callClaudeStream({
  systemPrompt,
  userMessage,
  model = "claude-sonnet-4-6",
  temperature = 0.2,
  maxTokens = 4096,
}: AIRequestOptions) {
  const requestId = crypto.randomUUID()

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })

  return { stream, requestId }
}

export async function callClaude({
  systemPrompt,
  userMessage,
  model = "claude-sonnet-4-6",
  temperature = 0.2,
  maxTokens = 4096,
}: AIRequestOptions): Promise<AIResponse> {
  const requestId = crypto.randomUUID()
  // Scale timeout with max_tokens: ~1.5s per 100 output tokens, minimum 120s
  const timeoutMs = Math.max(120_000, Math.ceil(maxTokens / 100) * 1500)

  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        },
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
