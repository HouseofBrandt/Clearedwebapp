/**
 * Model selection, gated by the Opus 4.7 rollout feature flag.
 *
 * `CLEARED_OPUS_4_7_ENABLED` is a server-side env var. When off, every
 * requested "claude-opus-4-7" model string is resolved back to
 * "claude-opus-4-6". This gives us a one-flag rollback if 4.7 surfaces a
 * regression we didn't anticipate — flip the env var, redeploy, done.
 *
 * Default: `true` in development, `false` in production. Production
 * explicitly opts in by setting `CLEARED_OPUS_4_7_ENABLED=true`.
 */

function isFlagEnabled(): boolean {
  const raw = process.env.CLEARED_OPUS_4_7_ENABLED
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase()
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true
    if (v === "false" || v === "0" || v === "no" || v === "off") return false
  }
  // Unset → enabled only outside production.
  return process.env.NODE_ENV !== "production"
}

/**
 * Returns the preferred Opus model string, respecting the feature flag.
 * Use at every default call site where "the best Opus we ship" is what
 * you want.
 */
export function preferredOpusModel(): string {
  return isFlagEnabled() ? "claude-opus-4-7" : "claude-opus-4-6"
}

/**
 * Coerce a caller-supplied model string to the rollout gate. If the caller
 * asks for 4.7 but the flag is off, fall back to 4.6. All other models
 * pass through unchanged (Sonnet, Haiku, older Opus revisions remain
 * selectable as-is).
 */
export function resolveModel(requested: string): string {
  if (requested === "claude-opus-4-7" && !isFlagEnabled()) {
    return "claude-opus-4-6"
  }
  return requested
}

/**
 * Exposed for tests. Do not use directly from application code — prefer
 * `preferredOpusModel()` / `resolveModel()`.
 */
export function __isOpus47EnabledForTest(): boolean {
  return isFlagEnabled()
}
