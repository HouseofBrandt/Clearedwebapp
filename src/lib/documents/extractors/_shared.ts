import { callClaude } from "@/lib/ai/client"

/**
 * Shared plumbing for structured-extraction prompts.
 *
 * All extractors follow the same shape: describe the target schema, pass
 * the document text, ask Claude to return JSON, parse and validate.
 *
 * We use claude-sonnet-4-6 for extraction — it's fast enough at the
 * document-upload latency budget and accurate enough on these bounded
 * schemas. Opus is only warranted for the case-analysis playbooks.
 */
export async function runExtractor(params: {
  documentText: string
  schemaDescription: string
  exampleJson: Record<string, any>
  documentLabel: string
}): Promise<{ extractedData: any; confidence: number } | null> {
  // Truncate to keep prompt tokens bounded. 16k chars ≈ 4k tokens is plenty
  // for a single form/statement; larger documents (multi-year packets) will
  // get extracted in pieces via the chunking pipeline.
  const truncated = params.documentText.slice(0, 16000)

  const systemPrompt = `You are a structured data extractor for US tax documents. Given a ${params.documentLabel}, extract the requested fields as JSON.

Rules:
- Return valid JSON matching the schema exactly. No prose before or after.
- If a field is not present in the document, set it to null.
- Currency values should be numbers (no symbols, no commas).
- Dates should be ISO strings (YYYY-MM-DD).
- SSNs and EINs should be digit strings with dashes (e.g., "123-45-6789").
- Add a top-level "_confidence" field: a number from 0 to 1 indicating your
  overall confidence that the extraction is accurate. Use 0.9+ when every
  field was clearly labeled, 0.5-0.8 when some fields required inference,
  and below 0.5 when the document was ambiguous or partially illegible.

Schema:
${params.schemaDescription}

Example output (values are illustrative):
${JSON.stringify(params.exampleJson, null, 2)}`

  const response = await callClaude({
    systemPrompt,
    userMessage: `Extract fields from this document:\n\n---\n${truncated}\n---`,
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 2000,
  })

  const parsed = parseJsonFromResponse(response.content)
  if (!parsed) return null

  const confidence = typeof parsed._confidence === "number" ? parsed._confidence : 0.7
  delete parsed._confidence
  return { extractedData: parsed, confidence }
}

function parseJsonFromResponse(text: string): Record<string, any> | null {
  // Claude sometimes wraps JSON in ```json fences despite instructions.
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try extracting the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}
