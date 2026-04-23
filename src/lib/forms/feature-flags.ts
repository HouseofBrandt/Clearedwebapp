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
 * When true (current default):
 *   - Case-first hub at `/cases/:caseId/forms` is the primary surface.
 *   - New renderer from `src/lib/forms/pdf-renderer/` is used.
 *   - Auto-populate v3 with hybrid search is used.
 *
 * When false (opt-out via env):
 *   - `/forms` remains the primary form surface.
 *   - The legacy inline PDF-fill logic in preview-pdf/route.ts is used.
 *   - New case-first hub at `/cases/:caseId/forms` is hidden.
 *   - Auto-populate v3 is NOT used (v2 is the default).
 *
 * Existing FormInstance rows work in both modes. Revision defaults to the
 * form's currentRevision for pre-v2 rows.
 */
export const FORM_BUILDER_V2_ENABLED = envBool("FORM_BUILDER_V2_ENABLED", true)

/**
 * Whether to run auto-populate v3 (hybrid search with embeddings) or v2
 * (the legacy multi-source engine). Gated independently from the master
 * switch so v2 can be forced back on per-environment without disabling
 * the whole case-first hub.
 *
 * V3 now degrades gracefully when no DocumentChunk rows exist for a case
 * (see autoPopulateV3 in auto-populate-v3.ts) — so having this flag on
 * without chunking enabled no longer silently breaks prefill; it just
 * produces V2-quality results until chunking is populated.
 */
export const AUTO_POPULATE_V3_ENABLED = envBool("AUTO_POPULATE_V3_ENABLED", FORM_BUILDER_V2_ENABLED)

/**
 * Whether to chunk and embed documents on upload. When true, upload
 * fires a background chunking pass that writes DocumentChunk rows with
 * pgvector embeddings — which powers the V3 auto-populate semantic
 * search. When false, only `extractedText` is populated.
 *
 * Flipping this ON requires pgvector to be enabled on the DB. The
 * admin dashboard surfaces a warning if pgvector is disabled.
 */
export const DOCUMENT_CHUNKING_ENABLED = envBool("DOCUMENT_CHUNKING_ENABLED", true)
