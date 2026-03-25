/**
 * Penalty Reference Library
 *
 * Authoritative penalty type definitions, IRC citations, IRM references,
 * FTA eligibility, and reasonable cause categories for penalty abatement work.
 */

// ═══════════════════════════════════════════════════════════════
// PENALTY TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export type PenaltyTypeCode = "FTF" | "FTP" | "FTD" | "ACCURACY" | "ESTIMATED_TAX" | "OTHER"

export interface PenaltyTypeInfo {
  name: string
  irc: string
  rate: string
  ftaEligible: boolean
  irmAbatement: string
  description: string
}

export const PENALTY_TYPES: Record<PenaltyTypeCode, PenaltyTypeInfo> = {
  FTF: {
    name: "Failure to File",
    irc: "\u00A7 6651(a)(1)",
    rate: "5% per month, max 25%",
    ftaEligible: true,
    irmAbatement: "IRM 20.1.1.3.2",
    description:
      "Assessed when a return is filed after the due date (including extensions). " +
      "The penalty is 5% of the unpaid tax for each month or partial month the return is late, " +
      "up to a maximum of 25%.",
  },
  FTP: {
    name: "Failure to Pay",
    irc: "\u00A7 6651(a)(2)",
    rate: "0.5% per month, max 25%",
    ftaEligible: true,
    irmAbatement: "IRM 20.1.1.3.2",
    description:
      "Assessed when the tax shown on the return is not paid by the due date. " +
      "The penalty is 0.5% of the unpaid tax for each month or partial month, " +
      "up to a maximum of 25%. Reduced to 0.25% if an installment agreement is in effect.",
  },
  FTD: {
    name: "Failure to Deposit",
    irc: "\u00A7 6656",
    rate: "2\u201315% depending on days late",
    ftaEligible: true,
    irmAbatement: "IRM 20.1.1.3.2",
    description:
      "Assessed when employment taxes are not deposited on time. " +
      "Rates: 2% (1\u20135 days late), 5% (6\u201315 days), 10% (16+ days or day after IRS notice), " +
      "15% (10+ days after first delinquency notice or day after demand for immediate payment).",
  },
  ACCURACY: {
    name: "Accuracy-Related",
    irc: "\u00A7 6662",
    rate: "20% of underpayment",
    ftaEligible: false,
    irmAbatement: "IRM 20.1.5",
    description:
      "Assessed when there is a substantial understatement of income tax, negligence, " +
      "disregard of rules/regulations, substantial valuation misstatement, or other accuracy issues. " +
      "Not eligible for First Time Abate relief.",
  },
  ESTIMATED_TAX: {
    name: "Estimated Tax",
    irc: "\u00A7 6654",
    rate: "Federal short-term rate + 3%",
    ftaEligible: false,
    irmAbatement: "N/A (automatic waiver provisions only)",
    description:
      "Assessed when estimated tax payments are insufficient or not timely. " +
      "Calculated using the federal short-term rate plus 3 percentage points. " +
      "Not eligible for FTA; only automatic statutory waiver provisions apply (\u00A7 6654(e)).",
  },
  OTHER: {
    name: "Other Penalty",
    irc: "Various",
    rate: "Varies",
    ftaEligible: false,
    irmAbatement: "IRM 20.1",
    description:
      "Catch-all for penalties not specifically categorized above (e.g., information return penalties, " +
      "international information return penalties, erroneous refund claims). Review applicable IRC section.",
  },
}

// ═══════════════════════════════════════════════════════════════
// REASONABLE CAUSE CATEGORIES
// ═══════════════════════════════════════════════════════════════

export interface ReasonableCauseCategory {
  id: string
  label: string
  irmRef: string
  description: string
  typicalEvidence: string[]
}

export const REASONABLE_CAUSE_CATEGORIES: ReasonableCauseCategory[] = [
  {
    id: "illness",
    label: "Serious Illness or Incapacity",
    irmRef: "IRM 20.1.1.3.2.2.1",
    description:
      "The taxpayer or an immediate family member experienced a serious illness, " +
      "hospitalization, or incapacity that prevented timely filing or payment.",
    typicalEvidence: [
      "Medical records or doctor's letter",
      "Hospital admission/discharge records",
      "Prescription records showing treatment timeline",
    ],
  },
  {
    id: "death",
    label: "Death of Taxpayer or Immediate Family",
    irmRef: "IRM 20.1.1.3.2.2.1",
    description:
      "Death of the taxpayer, spouse, or immediate family member " +
      "that disrupted the taxpayer's ability to comply.",
    typicalEvidence: [
      "Death certificate",
      "Obituary or funeral records",
      "Court appointment of executor/administrator",
    ],
  },
  {
    id: "disaster",
    label: "Natural Disaster, Fire, or Casualty",
    irmRef: "IRM 20.1.1.3.2.2.3",
    description:
      "A natural disaster (flood, hurricane, earthquake, wildfire), fire, or other casualty event " +
      "destroyed records or prevented timely compliance.",
    typicalEvidence: [
      "FEMA disaster declaration (if applicable)",
      "Insurance claim documentation",
      "Police/fire department report",
      "Photos of damage",
    ],
  },
  {
    id: "records",
    label: "Inability to Obtain Records",
    irmRef: "IRM 20.1.1.3.2.2.4",
    description:
      "The taxpayer was unable to obtain the necessary records to file or pay " +
      "despite reasonable efforts to do so.",
    typicalEvidence: [
      "Correspondence requesting records from third parties",
      "Proof of records being held by another party (e.g., divorce, litigation)",
      "Timeline showing diligent efforts to obtain records",
    ],
  },
  {
    id: "reliance",
    label: "Reliance on Tax Professional",
    irmRef: "IRM 20.1.1.3.2.2.6",
    description:
      "The taxpayer relied on a tax professional who failed to meet a filing or payment deadline. " +
      "The taxpayer must show they provided all necessary information to the professional timely.",
    typicalEvidence: [
      "Engagement letter with tax professional",
      "Correspondence/emails showing timely delivery of documents",
      "Tax professional's acknowledgment of error (if available)",
    ],
  },
  {
    id: "irs_error",
    label: "IRS Error or Delay",
    irmRef: "IRM 20.1.1.3.2.2.5",
    description:
      "The IRS provided erroneous written advice, or an IRS delay or error " +
      "contributed to the taxpayer's noncompliance.",
    typicalEvidence: [
      "Copy of written IRS advice relied upon",
      "Correspondence showing IRS processing delays",
      "IRS notice timeline demonstrating the error",
    ],
  },
  {
    id: "other",
    label: "Other Reasonable Cause",
    irmRef: "IRM 20.1.1.3.2",
    description:
      "Any other circumstance that establishes reasonable cause and the exercise of " +
      "ordinary business care and prudence. Must be evaluated under the facts and circumstances.",
    typicalEvidence: [
      "Detailed written explanation of circumstances",
      "Supporting documentation specific to the situation",
      "Timeline of events demonstrating good faith effort",
    ],
  },
]

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the PenaltyTypeInfo for a given penalty type code.
 */
export function getPenaltyInfo(code: PenaltyTypeCode): PenaltyTypeInfo {
  return PENALTY_TYPES[code]
}

/**
 * Returns the reasonable cause category by id.
 */
export function getReasonableCauseCategory(id: string): ReasonableCauseCategory | undefined {
  return REASONABLE_CAUSE_CATEGORIES.find((c) => c.id === id)
}

/**
 * Checks whether a penalty type code is eligible for FTA relief.
 */
export function isFTAEligibleType(code: PenaltyTypeCode): boolean {
  return PENALTY_TYPES[code]?.ftaEligible ?? false
}
