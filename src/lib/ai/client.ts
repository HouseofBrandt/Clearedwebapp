import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  timeout: 120_000, // 2 minute timeout per request
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
  const status = error?.status
  return status === 429 || status === 529 || (status >= 500 && status < 600)
}

export async function callClaude({
  systemPrompt,
  userMessage,
  model = "claude-sonnet-4-6",
  temperature = 0.2,
  maxTokens = 4096,
}: AIRequestOptions): Promise<AIResponse> {
  const requestId = crypto.randomUUID()

  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      })

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
