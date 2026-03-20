import OpenAI from "openai"

const EMBEDDING_MODEL = "text-embedding-3-small"
const EMBEDDING_DIMENSIONS = 1536

let _openai: OpenAI | null = null
function getClient(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error("OPENAI_API_KEY is not set. Embeddings are unavailable.")
    _openai = new OpenAI({ apiKey: key })
  }
  return _openai
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await getClient().embeddings.create(
      {
        model: EMBEDDING_MODEL,
        input: text.substring(0, 8000),
        dimensions: EMBEDDING_DIMENSIONS,
      },
      { signal: controller.signal as any }
    )
    return response.data[0].embedding
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  const allEmbeddings: number[][] = []
  // Smaller batches to stay under OpenAI's TPM rate limit on large documents
  const batchSize = 20

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.substring(0, 8000))

    let retries = 0
    const maxRetries = 5
    while (true) {
      try {
        const response = await getClient().embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        })
        allEmbeddings.push(...response.data.map((d) => d.embedding))
        onProgress?.(allEmbeddings.length, texts.length)
        break
      } catch (error: any) {
        // Retry on 429 rate limit errors with exponential backoff
        if (error?.status === 429 && retries < maxRetries) {
          retries++
          // Parse retry-after hint from error message, or use exponential backoff
          const retryMatch = error.message?.match(/try again in (\d+(?:\.\d+)?)(?:ms|s)/i)
          let waitMs: number
          if (retryMatch) {
            const value = parseFloat(retryMatch[1])
            waitMs = error.message.includes("ms") ? value : value * 1000
            waitMs = Math.max(waitMs, 500) // minimum 500ms
          } else {
            waitMs = 1000 * Math.pow(2, retries - 1) // 1s, 2s, 4s, 8s, 16s
          }
          console.log(`[Knowledge] Rate limited, retry ${retries}/${maxRetries} in ${waitMs}ms`)
          await new Promise((resolve) => setTimeout(resolve, waitMs))
          continue
        }
        throw error
      }
    }
  }

  return allEmbeddings
}
