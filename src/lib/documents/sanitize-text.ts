/**
 * Sanitize a string for safe storage in a Postgres `text` / `varchar` column.
 *
 * Background: Postgres rejects any byte sequence that isn't valid UTF-8
 * with SQLSTATE 22021 — "invalid byte sequence for encoding UTF8". The
 * two most common offenders produced by document extractors:
 *
 *   1. NUL bytes (U+0000, 0x00). Every PDF library occasionally emits
 *      these as padding or decoder artifacts. pdf-parse in particular
 *      is known to leak NULs from compressed streams.
 *
 *   2. Lone UTF-16 surrogate halves (U+D800..U+DFFF unpaired). These
 *      are technically invalid Unicode and Postgres will refuse them
 *      even though JavaScript's string type permits them.
 *
 * Both cause the document upload / transcribe write to fail with the
 * same 22021 error surfaced to the user. Historically we had ad-hoc
 * `.replace(/\0/g, "")` scattered in a few call sites; this helper
 * centralizes the fix so every extraction / transcription path behaves
 * the same way.
 *
 * Keep this surgical. We do NOT normalize whitespace, strip high ASCII,
 * or trim — those are presentation concerns and callers that want them
 * should do them explicitly. The only job here is to ensure Postgres
 * won't reject the string.
 */
export function sanitizeForPostgres(text: string | null | undefined): string {
  if (!text) return ""

  // Strip NUL bytes. These are the specific cause of the SQLSTATE 22021
  // error users hit on PDF upload ("invalid byte sequence for encoding
  // UTF8: 0x00"). Not a user-visible character, safe to drop.
  let out = text.replace(/\u0000/g, "")

  // Strip lone UTF-16 surrogate halves. Pairing is required for a
  // surrogate to represent a valid code point; an unpaired one is
  // invalid Unicode and Postgres rejects it. Drop rather than replace
  // so we don't introduce a replacement character into legal text.
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
  out = out.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")

  return out
}

/**
 * Convenience: sanitize OR return null if the result is empty after
 * trimming. Matches the common "set null when there's nothing useful
 * to store" pattern at document-upload write sites.
 */
export function sanitizeForPostgresOrNull(text: string | null | undefined): string | null {
  const sanitized = sanitizeForPostgres(text).trim()
  return sanitized.length > 0 ? sanitized : null
}
