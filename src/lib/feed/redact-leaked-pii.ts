/**
 * Defense-in-depth render-time redaction of leaked PII in feed content.
 *
 * Background: feed posts can contain text that was written to the DB with
 * upstream bugs — an encrypted `clientName` value used verbatim as a
 * `#CaseTag` label, a tokenizer-output `[NAME-A1B2]` string copied into a
 * note — and the feed card renders the content as-is.
 *
 * This utility catches those leaks at render time by pattern-matching
 * known-unsafe shapes and replacing them with `[redacted]`. It does NOT
 * decrypt or de-tokenize; it simply prevents the raw internal
 * representations from being shown to the practitioner.
 *
 * The real fix is at the write site (decrypt before writing; never mix
 * tokenizer output with user-facing content). This is the safety net.
 *
 * Patterns matched:
 *   - Encryption envelope:  `v1:` + `:iv_hex:tag_hex:ciphertext_hex`
 *     where each hex run is ≥ 16 chars.
 *   - Tokenizer output:      `[NAME-A1B2C3]`, `[SSN-...]`, etc. — any
 *     `[<WORD>-<HEX>]` shape with uppercase word and hex-like id.
 *
 * Never matches: practitioner-entered hex values, normal IRC citations
 * (`IRC § 6651`), CP notice codes (`CP2000`), TABS numbers.
 */

// v1:iv:tag:ciphertext. Each segment is hex, variable length but each
// at least 16 chars to avoid false positives on short hex-like tokens.
// Trailing word-break is enforced so we don't chew off surrounding
// punctuation.
const ENCRYPTION_ENVELOPE = /\bv1:[0-9a-f]{16,}:[0-9a-f]{16,}:[0-9a-f]{16,}\b/gi

// [NAME-A1B2C3], [SSN-ABC123], etc. Word segment is uppercase letters
// + optional hyphenated suffix (e.g., `NAME-ALT`). Hash is 6+ hex chars.
const TOKENIZER_TOKEN = /\[[A-Z][A-Z_\-]{2,20}-[0-9A-F]{6,}\]/g

/**
 * Redact leaked encrypted / tokenized values in text. Returns the input
 * unchanged when no patterns match (common case — no allocation).
 */
export function redactLeakedPII(text: string): string {
  if (!text) return text

  let out = text
  if (ENCRYPTION_ENVELOPE.test(out)) {
    // Reset lastIndex after `test` (global regex state quirk) before replace.
    ENCRYPTION_ENVELOPE.lastIndex = 0
    out = out.replace(ENCRYPTION_ENVELOPE, "[redacted]")
  }
  if (TOKENIZER_TOKEN.test(out)) {
    TOKENIZER_TOKEN.lastIndex = 0
    out = out.replace(TOKENIZER_TOKEN, "[redacted]")
  }
  return out
}

/**
 * Same redaction, but returns the original string + a boolean indicating
 * whether anything was redacted. Callers that want to log a warning when
 * they catch a leak can use this.
 */
export function redactLeakedPIIWithFlag(text: string): { text: string; wasRedacted: boolean } {
  const out = redactLeakedPII(text)
  return { text: out, wasRedacted: out !== text }
}
