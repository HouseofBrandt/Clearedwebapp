/**
 * First Time Abate (FTA) Eligibility Checker
 *
 * Implements IRM 20.1.1.3.6.1 — First Time Abate (FTA) administrative waiver.
 *
 * FTA is a one-time administrative waiver that allows the IRS to abate
 * certain penalties for taxpayers with a clean compliance history.
 *
 * Requirements:
 * 1. The penalty type must be FTF (§6651(a)(1)), FTP (§6651(a)(2)), or FTD (§6656)
 * 2. The taxpayer must not have had any penalties in the 3 prior tax years
 * 3. All required returns must currently be filed
 * 4. All outstanding balances must be paid or in an approved payment arrangement
 */

import { PENALTY_TYPES, type PenaltyTypeCode } from "./penalty-reference"

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FTAInput {
  /** The tax year the penalty was assessed for */
  taxYear: number
  /** The type of penalty being evaluated */
  penaltyType: PenaltyTypeCode
  /** The dollar amount of the penalty */
  penaltyAmount: number
  /**
   * Whether returns were filed for each of the 3 prior years.
   * Index 0 = TY-1, Index 1 = TY-2, Index 2 = TY-3.
   * Example: for TY 2023, index 0 = 2022, index 1 = 2021, index 2 = 2020.
   */
  priorYearsFiled: boolean[]
  /**
   * Whether any penalties were assessed for each of the 3 prior years.
   * Same indexing as priorYearsFiled.
   * true = penalty was assessed, false = clean year.
   */
  priorYearsPenalties: boolean[]
  /** Whether the taxpayer is currently in compliance (all returns filed, payments current) */
  currentlyCompliant: boolean
}

export interface FTAFactor {
  /** Description of the eligibility factor */
  factor: string
  /** Whether this factor is satisfied */
  met: boolean
  /** Detailed explanation for the practitioner */
  detail: string
}

export interface FTAResult {
  /** Overall eligibility determination */
  eligible: boolean
  /** Summary reason for the determination */
  reason: string
  /** IRM citation for FTA */
  irmCitation: string
  /** Factor-by-factor breakdown */
  factors: FTAFactor[]
}

// ═══════════════════════════════════════════════════════════════
// FTA ELIGIBILITY CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluates whether a penalty qualifies for First Time Abate (FTA) relief
 * under IRM 20.1.1.3.6.1.
 *
 * The function checks each requirement independently and returns a detailed
 * factor-by-factor breakdown so practitioners can explain the result to clients.
 */
export function checkFTAEligibility(input: FTAInput): FTAResult {
  const factors: FTAFactor[] = []
  const irmCitation = "IRM 20.1.1.3.6.1"

  // ─── Factor 1: Penalty type must be FTA-eligible ───
  const penaltyInfo = PENALTY_TYPES[input.penaltyType]
  const typeEligible = penaltyInfo?.ftaEligible ?? false

  if (typeEligible) {
    factors.push({
      factor: "Penalty type is FTA-eligible",
      met: true,
      detail: `${penaltyInfo.name} (${penaltyInfo.irc}) is eligible for First Time Abate relief. ` +
        `FTA applies to Failure to File (\u00A7 6651(a)(1)), Failure to Pay (\u00A7 6651(a)(2)), ` +
        `and Failure to Deposit (\u00A7 6656) penalties.`,
    })
  } else {
    const ineligibleReason =
      input.penaltyType === "ACCURACY"
        ? `Accuracy-related penalties (\u00A7 6662) are not eligible for FTA. ` +
          `These penalties require a reasonable cause defense under \u00A7 6664(c).`
        : input.penaltyType === "ESTIMATED_TAX"
        ? `Estimated tax penalties (\u00A7 6654) are not eligible for FTA. ` +
          `Relief is only available through statutory waiver provisions under \u00A7 6654(e).`
        : `This penalty type is not eligible for FTA relief. ` +
          `FTA only applies to FTF (\u00A7 6651(a)(1)), FTP (\u00A7 6651(a)(2)), and FTD (\u00A7 6656).`

    factors.push({
      factor: "Penalty type is FTA-eligible",
      met: false,
      detail: ineligibleReason,
    })
  }

  // ─── Factor 2: No penalties in 3 prior years ───
  const priorYears = input.priorYearsPenalties.slice(0, 3)
  const hasPriorPenalties = priorYears.some((p) => p === true)

  if (!hasPriorPenalties && priorYears.length === 3) {
    factors.push({
      factor: "No penalties in prior 3 years",
      met: true,
      detail: `No penalties were assessed for tax years ${input.taxYear - 1}, ` +
        `${input.taxYear - 2}, or ${input.taxYear - 3}. ` +
        `The taxpayer has a clean penalty history for the required lookback period.`,
    })
  } else if (priorYears.length < 3) {
    factors.push({
      factor: "No penalties in prior 3 years",
      met: false,
      detail: `Incomplete compliance history provided. FTA requires a clean penalty record ` +
        `for the 3 full tax years prior to the penalty year (${input.taxYear - 3} through ${input.taxYear - 1}). ` +
        `Only ${priorYears.length} year(s) of history were provided.`,
    })
  } else {
    const penaltyYears: number[] = []
    priorYears.forEach((hasPenalty, idx) => {
      if (hasPenalty) penaltyYears.push(input.taxYear - (idx + 1))
    })
    factors.push({
      factor: "No penalties in prior 3 years",
      met: false,
      detail: `Penalties were assessed in tax year(s): ${penaltyYears.join(", ")}. ` +
        `FTA requires no penalties for the 3 years preceding the penalty year ` +
        `(${input.taxYear - 3} through ${input.taxYear - 1}). ` +
        `Because the taxpayer has a prior penalty history, FTA relief is not available. ` +
        `Consider reasonable cause abatement as an alternative.`,
    })
  }

  // ─── Factor 3: Prior year returns filed ───
  const priorFiled = input.priorYearsFiled.slice(0, 3)
  const allPriorFiled = priorFiled.length === 3 && priorFiled.every((f) => f === true)

  if (allPriorFiled) {
    factors.push({
      factor: "All prior-year returns filed",
      met: true,
      detail: `Returns for tax years ${input.taxYear - 1}, ${input.taxYear - 2}, ` +
        `and ${input.taxYear - 3} have been filed. The filing requirement is satisfied.`,
    })
  } else {
    const unfiledYears: number[] = []
    priorFiled.forEach((filed, idx) => {
      if (!filed) unfiledYears.push(input.taxYear - (idx + 1))
    })
    factors.push({
      factor: "All prior-year returns filed",
      met: false,
      detail: `Returns for tax year(s) ${unfiledYears.join(", ")} have not been filed. ` +
        `FTA requires all required returns to be filed for the 3 years prior to the penalty year. ` +
        `File outstanding returns before requesting FTA relief.`,
    })
  }

  // ─── Factor 4: Currently compliant ───
  if (input.currentlyCompliant) {
    factors.push({
      factor: "Currently in compliance",
      met: true,
      detail: `The taxpayer is currently compliant: all required returns are filed and ` +
        `any tax due is paid or in an approved payment arrangement.`,
    })
  } else {
    factors.push({
      factor: "Currently in compliance",
      met: false,
      detail: `The taxpayer is not currently in compliance. FTA requires that all ` +
        `required returns are filed and any outstanding balance is paid or subject ` +
        `to an approved payment arrangement. Resolve compliance issues before requesting FTA.`,
    })
  }

  // ─── Overall determination ───
  const allFactorsMet = factors.every((f) => f.met)

  let reason: string
  if (allFactorsMet) {
    reason =
      `ELIGIBLE for First Time Abate relief under ${irmCitation}. ` +
      `The ${penaltyInfo.name} penalty of $${input.penaltyAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ` +
      `for tax year ${input.taxYear} meets all FTA criteria. ` +
      `Request abatement by calling the IRS Practitioner Priority Service (PPS) ` +
      `or submitting a written request citing ${irmCitation}.`
  } else {
    const failedFactors = factors.filter((f) => !f.met).map((f) => f.factor)
    reason =
      `NOT ELIGIBLE for First Time Abate relief. ` +
      `Failed factor(s): ${failedFactors.join("; ")}. ` +
      `Consider pursuing reasonable cause abatement under IRM 20.1.1.3.2 instead.`
  }

  return {
    eligible: allFactorsMet,
    reason,
    irmCitation,
    factors,
  }
}
