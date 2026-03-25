/**
 * Filing Status Checker
 * Determines filing status from liability period data.
 *
 * SFR (Substitute for Return) Detection:
 * A year is SFR when there's an assessment (TC 290/300) but no return
 * was filed by the taxpayer (no TC 150).
 */

export type FilingStatusType = "filed" | "unfiled" | "sfr"

/** Estimated SFR reduction factor — conservative estimate based on IRM 4.12.1 */
export const SFR_ESTIMATED_REDUCTION = 0.35

/** Conservative estimate of actual liability as % of SFR assessment */
export const SFR_ACTUAL_LIABILITY_ESTIMATE = 0.65

export interface LiabilityPeriodData {
  status: string | null
  originalAssessment: number | null
  assessmentDate: string | null
  csedDate: string | null
}

export function getFilingStatus(lp: LiabilityPeriodData): FilingStatusType {
  const s = (lp.status || "").toLowerCase()
  if (s.includes("filed") || s.includes("paid") || s === "compliant") return "filed"
  if (s.includes("sfr") || s.includes("substitute") || s.includes("asfr")) return "sfr"
  if (lp.originalAssessment != null && lp.originalAssessment > 0 && !s.includes("filed")) return "sfr"
  return "unfiled"
}

export function estimateSFRReduction(sfrAssessment: number): {
  estimatedActual: number
  potentialReduction: number
} {
  return {
    estimatedActual: Math.round(sfrAssessment * SFR_ACTUAL_LIABILITY_ESTIMATE),
    potentialReduction: Math.round(sfrAssessment * SFR_ESTIMATED_REDUCTION),
  }
}
