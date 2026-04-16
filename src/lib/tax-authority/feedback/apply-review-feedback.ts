/**
 * Pippen Phase 3 — review-action feedback loop.
 *
 * When a practitioner reviews an AI task, their approve / edit / reject
 * decision teaches the system which authorities the firm actually trusts.
 * This module reads the review action + the AI output, extracts cited
 * authorities, and nudges their `practitionerScore` / `qualityScore`
 * accordingly. Over months, retrieval quality improves without any
 * explicit "rate this source" UI.
 *
 * Design constraints:
 *
 *   - Conservative. Moves scores by small amounts per event. Floor 0.3,
 *     cap 1.5 — one bad review cannot blacklist an authority.
 *   - Bundle-safe. This module imports ONLY `prisma`. Callers import it
 *     dynamically inside handlers so the review route's serverless
 *     bundle doesn't pull in heavier tax-authority infrastructure.
 *   - Best-effort. Citation parsing is regex-based; misses on novel
 *     citation formats are acceptable. The scanForGaps cron will
 *     eventually surface under-cited or drifted authorities regardless.
 *   - Fire-and-forget. Never blocks the review route — callers should
 *     `.catch(() => {})` or log-and-continue.
 */

import { prisma } from "@/lib/db"

// ============================================================
// Tunables
// ============================================================

/** +delta on APPROVE. Cap: PRACTITIONER_SCORE_MAX. */
const APPROVE_DELTA = 0.05
/** Multiplier on REJECT_*. Floor: PRACTITIONER_SCORE_MIN. */
const REJECT_MULTIPLIER = 0.90
/** Survival bonus on EDIT_APPROVE (citation kept after edit). */
const EDIT_SURVIVED_DELTA = 0.02
/** Removal penalty on EDIT_APPROVE (citation removed during edit). */
const EDIT_REMOVED_MULTIPLIER = 0.95

const PRACTITIONER_SCORE_MAX = 1.5
const PRACTITIONER_SCORE_MIN = 0.3

// ============================================================
// Citation extraction
// ============================================================

/**
 * Extract authority citations from free text. Intentionally conservative:
 * matches IRC § references, Treas. Reg. §, IRM sections, Rev. Proc.,
 * Rev. Rul., Notice, PLR, TAM, CCA, and Tax Court docket patterns.
 *
 * Returns an array of normalized citation strings — the same format
 * `CanonicalAuthority.normalizedCitation` uses, so we can match directly.
 */
export function extractCitations(text: string): string[] {
  if (!text) return []
  const hits = new Set<string>()

  const patterns: { re: RegExp; normalize: (m: RegExpMatchArray) => string }[] = [
    // IRC § 6015, IRC 6651, I.R.C. § 7122, 26 U.S.C. § 6662 — normalize to "IRC §<num>"
    {
      re: /\b(?:I\.?R\.?C\.?|26\s*U\.?S\.?C\.?)\s*(?:§|sec(?:tion)?\.?)?\s*(\d{3,4})(?:\((\w+)\))?/gi,
      normalize: (m) => `IRC §${m[1]}${m[2] ? `(${m[2]})` : ""}`,
    },
    // Treas. Reg. § 1.6015-2, 26 CFR 1.6015-2 — normalize to "Treas. Reg. §<num>"
    {
      re: /\b(?:Treas(?:ury)?\.?\s*Reg(?:ulation)?s?\.?|26\s*C\.?F\.?R\.?)\s*(?:§|sec(?:tion)?\.?)?\s*([\d.\-]+)/gi,
      normalize: (m) => `Treas. Reg. §${m[1].replace(/\.$/, "")}`,
    },
    // IRM 5.8.5, IRM §5.8.5.4 — normalize to "IRM <num>"
    {
      re: /\bI\.?R\.?M\.?\s*(?:§|sec(?:tion)?\.?)?\s*([\d.]+(?:[.\-][\d.]+)*)/gi,
      normalize: (m) => `IRM ${m[1].replace(/\.$/, "")}`,
    },
    // Rev. Proc. 2021-12, Rev Proc 2023-27 — normalize
    {
      re: /\bRev(?:enue)?\.?\s*Proc(?:edure)?\.?\s*(\d{2,4}[\-–]\d{1,3})/gi,
      normalize: (m) => `Rev. Proc. ${m[1].replace(/–/, "-")}`,
    },
    // Rev. Rul. 2005-23 — normalize
    {
      re: /\bRev(?:enue)?\.?\s*Rul(?:ing)?\.?\s*(\d{2,4}[\-–]\d{1,3})/gi,
      normalize: (m) => `Rev. Rul. ${m[1].replace(/–/, "-")}`,
    },
    // Notice 2023-15
    {
      re: /\bNotice\s+(\d{2,4}[\-–]\d{1,3})/gi,
      normalize: (m) => `Notice ${m[1].replace(/–/, "-")}`,
    },
    // PLR 202145001, TAM 200402012, CCA 202008012
    {
      re: /\b(PLR|TAM|CCA|AM)\s*(\d{6,12})/gi,
      normalize: (m) => `${m[1].toUpperCase()} ${m[2]}`,
    },
    // Tax Court docket: "T.C. Memo. 2023-15", "T.C. Summary Op. 2019-4"
    {
      re: /\bT\.?C\.?\s*(?:Memo|Summary\s*Op(?:inion)?)\.?\s*(\d{4}[\-–]\d{1,4})/gi,
      normalize: (m) => `T.C. Memo ${m[1].replace(/–/, "-")}`,
    },
  ]

  for (const { re, normalize } of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      hits.add(normalize(match))
    }
  }

  return Array.from(hits)
}

// ============================================================
// Score update helpers
// ============================================================

function boundedApprove(score: number): number {
  return Math.min(PRACTITIONER_SCORE_MAX, score + APPROVE_DELTA)
}

function boundedReject(score: number): number {
  return Math.max(PRACTITIONER_SCORE_MIN, score * REJECT_MULTIPLIER)
}

function boundedEditSurvived(score: number): number {
  return Math.min(PRACTITIONER_SCORE_MAX, score + EDIT_SURVIVED_DELTA)
}

function boundedEditRemoved(score: number): number {
  return Math.max(PRACTITIONER_SCORE_MIN, score * EDIT_REMOVED_MULTIPLIER)
}

/**
 * Resolve citation strings to CanonicalAuthority rows + their upstream
 * SourceArtifact, so we can nudge both scores in one pass.
 */
async function resolveCitations(citations: string[]): Promise<
  Array<{ authorityId: string; artifactId: string | null; score: number; artifactScore: number | null }>
> {
  if (citations.length === 0) return []

  // Match either exact normalized citation or case-insensitive citation string
  const rows = await prisma.canonicalAuthority.findMany({
    where: {
      OR: [
        { normalizedCitation: { in: citations } },
        { citationString: { in: citations } },
      ],
    },
    select: {
      id: true,
      practitionerScore: true,
      artifactId: true,
      artifact: { select: { qualityScore: true } },
    },
  })

  return rows.map((r) => ({
    authorityId: r.id,
    artifactId: r.artifactId,
    score: r.practitionerScore,
    artifactScore: r.artifact?.qualityScore ?? null,
  }))
}

// ============================================================
// Entry point
// ============================================================

export type ReviewDecision = "APPROVE" | "EDIT_APPROVE" | "REJECT_REPROMPT" | "REJECT_MANUAL"

export interface ReviewFeedbackResult {
  reviewActionId: string
  citationsExtracted: number
  authoritiesMatched: number
  adjustments: Array<{ authorityId: string; before: number; after: number }>
  skipped?: string
}

/**
 * Apply feedback from a review action to the scores of any authorities
 * the AI output cited.
 *
 * Call this AFTER the ReviewAction row is created. Fire-and-forget —
 * errors are swallowed upstream and never block the review route.
 */
export async function applyReviewFeedback(
  reviewActionId: string
): Promise<ReviewFeedbackResult> {
  const emptyResult = (skipped: string): ReviewFeedbackResult => ({
    reviewActionId,
    citationsExtracted: 0,
    authoritiesMatched: 0,
    adjustments: [],
    skipped,
  })

  const review = await prisma.reviewAction.findUnique({
    where: { id: reviewActionId },
    select: {
      id: true,
      action: true,
      editedOutput: true,
      aiTask: {
        select: {
          id: true,
          detokenizedOutput: true,
        },
      },
    },
  })

  if (!review) return emptyResult("review_not_found")
  if (!review.aiTask) return emptyResult("task_not_found")

  const decision = review.action as ReviewDecision
  const originalOutput = review.aiTask.detokenizedOutput ?? ""
  const editedOutput = review.editedOutput ?? ""

  // Source-of-truth text for citation extraction:
  //   APPROVE / REJECT_* → the original AI output
  //   EDIT_APPROVE → we need BOTH to see which citations survived editing
  const originalCitations = extractCitations(originalOutput)
  if (originalCitations.length === 0) return emptyResult("no_citations_in_output")

  const resolved = await resolveCitations(originalCitations)
  if (resolved.length === 0) {
    return {
      reviewActionId,
      citationsExtracted: originalCitations.length,
      authoritiesMatched: 0,
      adjustments: [],
      skipped: "no_authority_matches",
    }
  }

  const adjustments: ReviewFeedbackResult["adjustments"] = []
  const now = new Date()

  for (const r of resolved) {
    let next: number

    if (decision === "APPROVE") {
      next = boundedApprove(r.score)
    } else if (decision === "REJECT_REPROMPT" || decision === "REJECT_MANUAL") {
      next = boundedReject(r.score)
    } else if (decision === "EDIT_APPROVE") {
      // Check if this citation survived the edit. If the original had it
      // and the edited version doesn't, the practitioner removed it →
      // mild negative. If it survived, mild positive.
      const stillPresent = editedOutput && originalCitations.some((c) => {
        // Cheap check: if the specific citation string appears in edited text
        // via any of its normalized forms, it survived. Extract from edited
        // too and compare.
        const editedCites = extractCitations(editedOutput)
        return editedCites.includes(c)
      })
      next = stillPresent ? boundedEditSurvived(r.score) : boundedEditRemoved(r.score)
    } else {
      // Unknown decision — leave score alone
      continue
    }

    if (Math.abs(next - r.score) < 1e-6) continue // no-op; don't write

    try {
      await prisma.canonicalAuthority.update({
        where: { id: r.authorityId },
        data: {
          practitionerScore: next,
          lastCitedAt: now,
          timesCited: { increment: 1 },
        },
      })
      adjustments.push({ authorityId: r.authorityId, before: r.score, after: next })

      // Also nudge the upstream artifact's qualityScore in the same direction
      // so retrieval-time JOIN sees the signal immediately.
      if (r.artifactId && r.artifactScore != null) {
        const artifactDelta = next - r.score
        const artifactNext = Math.max(
          PRACTITIONER_SCORE_MIN,
          Math.min(PRACTITIONER_SCORE_MAX, r.artifactScore + artifactDelta)
        )
        await prisma.sourceArtifact.update({
          where: { id: r.artifactId },
          data: { qualityScore: artifactNext },
        }).catch(() => {
          // Non-fatal; artifact may have been garbage-collected
        })
      }
    } catch (err) {
      console.warn(
        `[applyReviewFeedback] update failed for authority ${r.authorityId}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  return {
    reviewActionId,
    citationsExtracted: originalCitations.length,
    authoritiesMatched: resolved.length,
    adjustments,
  }
}
