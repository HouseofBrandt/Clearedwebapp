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

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = []
  const batchSize = 100

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.substring(0, 8000))
    const response = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    })
    allEmbeddings.push(...response.data.map((d) => d.embedding))
  }

  return allEmbeddings
}
