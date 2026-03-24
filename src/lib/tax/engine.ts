/**
 * Deterministic Tax Computation Engine
 *
 * Covers tax years 2018-2025 with full bracket tables,
 * standard deductions, SS taxability, and filing thresholds.
 */

// ═══════════════════════════════════════════════════════════════
// TAX PARAMETERS BY YEAR (2018-2025)
// ═══════════════════════════════════════════════════════════════

type BracketEntry = [number, number]
type StatusBrackets = { single: BracketEntry[]; mfj: BracketEntry[]; hoh: BracketEntry[]; trust: BracketEntry[] }

const BRACKETS: Record<number, StatusBrackets> = {
  2018: { single: [[.10, 9525], [.12, 38700], [.22, 82500], [.24, 157500], [.32, 200000], [.35, 500000], [.37, Infinity]], mfj: [[.10, 19050], [.12, 77400], [.22, 165000], [.24, 315000], [.32, 400000], [.35, 600000], [.37, Infinity]], hoh: [[.10, 13600], [.12, 51800], [.22, 82500], [.24, 157500], [.32, 200000], [.35, 500000], [.37, Infinity]], trust: [[.10, 2550], [.24, 9150], [.35, 12500], [.37, Infinity]] },
  2019: { single: [[.10, 9700], [.12, 39475], [.22, 84200], [.24, 160725], [.32, 204100], [.35, 510300], [.37, Infinity]], mfj: [[.10, 19400], [.12, 78950], [.22, 168400], [.24, 321450], [.32, 408200], [.35, 612350], [.37, Infinity]], hoh: [[.10, 13850], [.12, 52850], [.22, 84200], [.24, 160700], [.32, 204100], [.35, 510300], [.37, Infinity]], trust: [[.10, 2600], [.24, 9300], [.35, 12750], [.37, Infinity]] },
  2020: { single: [[.10, 9875], [.12, 40125], [.22, 85525], [.24, 163300], [.32, 207350], [.35, 518400], [.37, Infinity]], mfj: [[.10, 19750], [.12, 80250], [.22, 171050], [.24, 326600], [.32, 414700], [.35, 622050], [.37, Infinity]], hoh: [[.10, 14100], [.12, 53700], [.22, 85500], [.24, 163300], [.32, 207350], [.35, 518400], [.37, Infinity]], trust: [[.10, 2600], [.24, 9450], [.35, 12950], [.37, Infinity]] },
  2021: { single: [[.10, 9950], [.12, 40525], [.22, 86375], [.24, 164925], [.32, 209425], [.35, 523600], [.37, Infinity]], mfj: [[.10, 19900], [.12, 81050], [.22, 172750], [.24, 329850], [.32, 418850], [.35, 628300], [.37, Infinity]], hoh: [[.10, 14200], [.12, 54200], [.22, 86350], [.24, 164900], [.32, 209400], [.35, 523600], [.37, Infinity]], trust: [[.10, 2650], [.24, 9550], [.35, 13050], [.37, Infinity]] },
  2022: { single: [[.10, 10275], [.12, 41775], [.22, 89075], [.24, 170050], [.32, 215950], [.35, 539900], [.37, Infinity]], mfj: [[.10, 20550], [.12, 83550], [.22, 178150], [.24, 340100], [.32, 431900], [.35, 647850], [.37, Infinity]], hoh: [[.10, 14650], [.12, 55900], [.22, 89050], [.24, 170050], [.32, 215950], [.35, 539900], [.37, Infinity]], trust: [[.10, 2750], [.24, 9850], [.35, 13450], [.37, Infinity]] },
  2023: { single: [[.10, 11000], [.12, 44725], [.22, 95375], [.24, 182100], [.32, 231250], [.35, 578125], [.37, Infinity]], mfj: [[.10, 22000], [.12, 89450], [.22, 190750], [.24, 364200], [.32, 462500], [.35, 693750], [.37, Infinity]], hoh: [[.10, 15700], [.12, 59850], [.22, 95350], [.24, 182100], [.32, 231250], [.35, 578100], [.37, Infinity]], trust: [[.10, 2900], [.24, 10550], [.35, 14450], [.37, Infinity]] },
  2024: { single: [[.10, 11600], [.12, 47150], [.22, 100525], [.24, 191950], [.32, 243725], [.35, 609350], [.37, Infinity]], mfj: [[.10, 23200], [.12, 94300], [.22, 201050], [.24, 383900], [.32, 487450], [.35, 731200], [.37, Infinity]], hoh: [[.10, 16550], [.12, 63100], [.22, 100500], [.24, 191950], [.32, 243700], [.35, 609350], [.37, Infinity]], trust: [[.10, 3100], [.24, 11150], [.35, 15200], [.37, Infinity]] },
  2025: { single: [[.10, 11925], [.12, 48475], [.22, 103350], [.24, 197300], [.32, 250525], [.35, 626350], [.37, Infinity]], mfj: [[.10, 23850], [.12, 96950], [.22, 206700], [.24, 394600], [.32, 501050], [.35, 751600], [.37, Infinity]], hoh: [[.10, 17000], [.12, 64850], [.22, 103350], [.24, 197300], [.32, 250525], [.35, 626350], [.37, Infinity]], trust: [[.10, 3150], [.24, 11450], [.35, 15650], [.37, Infinity]] },
}

// [baseStdDed, additional65+] per filing status per year
const STD_DED: Record<number, Record<string, [number, number]>> = {
  2018: { single: [12000, 1600], mfj: [24000, 1300], mfs: [12000, 1300], hoh: [18000, 1600], trust: [0, 0] },
  2019: { single: [12200, 1650], mfj: [24400, 1300], mfs: [12200, 1300], hoh: [18350, 1650], trust: [0, 0] },
  2020: { single: [12400, 1650], mfj: [24800, 1300], mfs: [12400, 1300], hoh: [18650, 1650], trust: [0, 0] },
  2021: { single: [12550, 1700], mfj: [25100, 1350], mfs: [12550, 1350], hoh: [18800, 1700], trust: [0, 0] },
  2022: { single: [12950, 1750], mfj: [25900, 1400], mfs: [12950, 1400], hoh: [19400, 1750], trust: [0, 0] },
  2023: { single: [13850, 1850], mfj: [27700, 1500], mfs: [13850, 1500], hoh: [20800, 1850], trust: [0, 0] },
  2024: { single: [14600, 1950], mfj: [29200, 1550], mfs: [14600, 1550], hoh: [21900, 1950], trust: [0, 0] },
  2025: { single: [15000, 2000], mfj: [30000, 1600], mfs: [15000, 1600], hoh: [22500, 2000], trust: [0, 0] },
}

const TRUST_EXEMPT: Record<string, number> = { estate: 600, simple_trust: 300, complex_trust: 100 }

const SS_THRESH: Record<string, [number, number]> = {
  single: [25000, 34000],
  mfj: [32000, 44000],
  mfs: [0, 0],
  hoh: [25000, 34000],
}

export const TC_CODES: Record<string, string> = {
  "150": "Tax return filed & tax liability assessed",
  "160": "Manually assessed penalty",
  "170": "Estimated tax penalty assessed",
  "196": "Interest assessed",
  "290": "Additional tax assessed",
  "291": "Abatement of prior tax assessment",
  "300": "Additional tax assessed by examination",
  "301": "Abatement of tax by exam",
  "420": "Examination started",
  "421": "Examination closed",
  "460": "Extension of time to file",
  "480": "Offer in compromise pending",
  "520": "IRS litigation",
  "530": "Currently not collectible",
  "540": "Deceased taxpayer",
  "550": "Statute extension (consent)",
  "570": "Additional account action pending",
  "571": "Resolved additional account action",
  "582": "Federal tax lien filed",
  "590": "ASFR assessment (Substitute for Return)",
  "598": "ASFR assessment pending",
  "599": "ASFR generated but not assessed",
  "610": "Payment with return",
  "640": "Advance payment",
  "670": "Subsequent payment",
  "700": "Credit transferred in",
  "706": "Credit transferred out",
  "710": "ES payment - penalty assessed",
  "716": "ES payment refunded",
  "766": "Credit to your account",
  "768": "Earned income credit",
  "806": "W-2/1099 withholding credit",
  "826": "Overpayment transferred to another period",
  "840": "Refund issued (manual)",
  "846": "Refund issued",
  "971": "Notice issued",
  "972": "Notice revised",
}

export function computeBracketTax(taxableIncome: number, year: number, status: string): number {
  const yearBrackets = BRACKETS[year] || BRACKETS[2024]
  const bk = (yearBrackets as any)[status] || yearBrackets.single
  let tax = 0
  let prev = 0
  for (const [rate, limit] of bk) {
    if (taxableIncome <= prev) break
    const taxable = Math.min(taxableIncome, limit) - prev
    tax += taxable * rate
    prev = limit
  }
  return Math.round(tax * 100) / 100
}

export function getStdDeduction(year: number, status: string, age65Count: number = 1): number {
  const sd = (STD_DED[year] || STD_DED[2024])[status] || (STD_DED[2024]).single
  return sd[0] + sd[1] * age65Count
}

export function computeSSATaxable(netSS: number, otherIncome: number, status: string = "single"): number {
  if (status === "trust") return 0
  const thresh = SS_THRESH[status] || SS_THRESH.single
  const provisionalIncome = otherIncome + netSS / 2
  if (provisionalIncome <= thresh[0]) return 0
  const taxable = Math.min(
    0.85 * netSS,
    0.5 * Math.min(Math.max(provisionalIncome - thresh[0], 0), thresh[1] - thresh[0]) +
    0.85 * Math.max(provisionalIncome - thresh[1], 0)
  )
  return Math.round(taxable * 100) / 100
}

export function getFilingThreshold(year: number, status: string, age65: boolean = false, entityType: string = "individual"): number {
  if (entityType === "estate" || entityType === "trust") return 600
  return getStdDeduction(year, status, age65 ? 1 : 0)
}

export interface YearData {
  year: number
  income?: {
    ssGross?: number
    ssRepay?: number
    pensionTaxable?: number
    interest?: number
    wages?: number
    fedWithheld?: number
    otherIncome?: number
  }
  overrides?: {
    filingStatus?: string
    age65Plus?: boolean
    entityType?: string
    additionalIncome?: number
    adjustments?: number
    useItemized?: boolean
    itemizedAmount?: number
    credits?: number
    additionalWithholding?: number
    age65CountMFJ?: number
  }
}

export interface ReturnEstimate {
  netSS: number
  ssaTaxable: number
  otherTaxable: number
  agi: number
  deduction: number
  taxableIncome: number
  taxLiability: number
  withholding: number
  credits: number
  balanceDue: number
  grossIncome: number
  filingThreshold: number
  filingRequired: boolean
  provisionalIncome: number
}

export function estimateReturn(yearData: YearData): ReturnEstimate {
  const { year, income = {}, overrides = {} } = yearData
  const status = overrides.filingStatus || "single"
  const age65 = overrides.age65Plus !== false
  const entityType = overrides.entityType || "individual"

  const netSS = (income.ssGross || 0) - (income.ssRepay || 0)
  const otherTaxable =
    (income.pensionTaxable || 0) +
    (income.interest || 0) +
    (income.wages || 0) +
    (income.otherIncome || 0) +
    (overrides.additionalIncome || 0)

  const ssaTaxable = entityType === "individual"
    ? computeSSATaxable(netSS, otherTaxable, status)
    : 0

  const agi = ssaTaxable + otherTaxable - (overrides.adjustments || 0)

  let deduction: number
  if (entityType !== "individual") {
    deduction = TRUST_EXEMPT[entityType] || 600
  } else if (overrides.useItemized && (overrides.itemizedAmount || 0) > 0) {
    deduction = overrides.itemizedAmount!
  } else {
    const age65Count = status === "mfj"
      ? (overrides.age65CountMFJ || 1)
      : (age65 ? 1 : 0)
    deduction = getStdDeduction(year, status, age65Count)
  }

  const taxableIncome = Math.max(agi - deduction, 0)
  const bracketStatus = entityType !== "individual" ? "trust" : status
  const taxLiability = computeBracketTax(taxableIncome, year, bracketStatus)
  const withholding = (income.fedWithheld || 0) + (overrides.additionalWithholding || 0)
  const credits = overrides.credits || 0
  const balanceDue = Math.round((taxLiability - withholding - credits) * 100) / 100
  const grossIncome = (income.ssGross || 0) + otherTaxable
  const filingThreshold = getFilingThreshold(year, status, age65, entityType)
  const filingRequired = grossIncome > filingThreshold || (income.fedWithheld || 0) > 0

  return {
    netSS,
    ssaTaxable,
    otherTaxable,
    agi,
    deduction,
    taxableIncome,
    taxLiability,
    withholding,
    credits,
    balanceDue,
    grossIncome,
    filingThreshold,
    filingRequired,
    provisionalIncome: otherTaxable + netSS / 2,
  }
}
