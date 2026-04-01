/**
 * Approximate token count using character-based heuristic.
 * ~4 characters per token for English text (matches cl100k_base average).
 */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
