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

export async function callClaude({
  systemPrompt,
  userMessage,
  model = "claude-sonnet-4-6",
  temperature = 0.2,
  maxTokens = 4096,
}: AIRequestOptions): Promise<AIResponse> {
  const requestId = crypto.randomUUID()

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
    // Retry once on transient errors
    if (error?.status === 429 || error?.status === 529 || error?.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000))
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
    }
    throw error
  }
}
