/**
 * Form builder feature flags.
 *
 * Controlled via env vars so they can be flipped without a redeploy on
 * platforms that support runtime env updates (Vercel, Railway, etc.).
 *
 * Flag lifecycle:
 *   1. Flag is false (default) → legacy surfaces active.
 *   2. Flag enabled for internal users → dogfood period.
 *   3. Flag enabled broadly → full rollout.
 *   4. Flag and legacy code removed in a follow-up PR.
 */

function envBool(name: string, defaultValue = false): boolean {
  const raw = process.env[name]
  if (raw === undefined) return defaultValue
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on"
}

/**
 * Master switch for the V2 form builder.
 *
 * When false:
 *   - `/forms` remains the primary form surface.
 *   - The legacy inline PDF-fill logic in preview-pdf/route.ts is used.
 *   - New case-first hub at `/cases/:caseId/forms` is hidden.
 *   - Auto-populate v3 is NOT used (v2 is the default).
 *
 * When true:
 *   - Case-first hub at `/cases/:caseId/forms` is the primary surface.
 *   - New renderer from `src/lib/forms/pdf-renderer/` is used.
 *   - Auto-populate v3 with hybrid search is used.
 *
 * Existing FormInstance rows work in both modes. Revision defaults to the
 * form's currentRevision for pre-v2 rows.
 */
export const FORM_BUILDER_V2_ENABLED = envBool("FORM_BUILDER_V2_ENABLED", false)

/**
 * Whether to run auto-populate v3 (hybrid search with embeddings) or v2
 * (the legacy multi-source engine). Gated independently from the master
 * switch so we can A/B test prefill accuracy before the full flip.
 */
export const AUTO_POPULATE_V3_ENABLED = envBool("AUTO_POPULATE_V3_ENABLED", FORM_BUILDER_V2_ENABLED)

/**
 * Whether to chunk and embed documents on upload. When false, only the
 * extractedText field is populated; no DocumentChunk rows are written.
 * Enable this before flipping AUTO_POPULATE_V3_ENABLED, otherwise v3 has
 * nothing to search against.
 */
export const DOCUMENT_CHUNKING_ENABLED = envBool("DOCUMENT_CHUNKING_ENABLED", false)
