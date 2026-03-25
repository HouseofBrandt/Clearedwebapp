/**
 * Reasonable Collection Potential (RCP) Calculator
 *
 * Deterministic computation — no AI involved.
 *
 * RCP = Future Income Component + Net Equity in Assets
 *
 * Future Income:
 *   Lump Sum  = (Monthly Disposable Income) × 12
 *   Periodic  = (Monthly Disposable Income) × 24
 *
 * Net Equity in Assets:
 *   Sum of (Quick Sale Value − Encumbrances) for each asset
 *   Quick Sale Value = FMV × 0.80 (per IRM 5.8.5.4)
 *
 * Reference: IRM 5.8.5 (Financial Analysis), Form 433-A/B
 */

import {
  QUICK_SALE_MULTIPLIER,
  CHALLENGED_VEHICLE_MULTIPLIER,
  FUTURE_INCOME_LUMP_SUM_MONTHS,
  FUTURE_INCOME_PERIODIC_MONTHS,
} from "./irs-standards"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RealEstateAsset {
  description?: string
  fmv: number
  loan: number
}

export interface VehicleAsset {
  description?: string
  fmv: number
  loan: number
}

export interface FinancialData {
  // Monthly Income
  wages: number
  selfEmployment: number
  socialSecurity: number
  pension: number
  rentalIncome: number
  otherIncome: number

  // Monthly Expenses (IRS allowable)
  housing: number
  utilities: number
  transportation: number
  healthInsurance: number
  courtOrderedPayments: number
  childcare: number
  otherExpenses: number

  // Assets
  bankAccounts: number
  investments: number
  retirement: number
  realEstate: RealEstateAsset[]
  vehicles: VehicleAsset[]
  otherAssets: number
  lifeInsurance: number
}

export interface BreakdownItem {
  category: string
  amount: number
  notes: string
}

export interface RCPResult {
  monthlyIncome: number
  allowableExpenses: number
  monthlyDisposable: number
  futureIncomeLumpSum: number
  futureIncomePeriodic: number
  assetEquity: number
  rcpLumpSum: number
  rcpPeriodic: number
  breakdown: BreakdownItem[]
}

export interface RCPOptions {
  /** Exclude retirement accounts from asset equity (common strategy). */
  excludeRetirement?: boolean
  /** Use 60% instead of 80% for vehicle quick-sale value. */
  challengeVehicleEquity?: boolean
  /** Override disposable income (e.g., modeled income reduction). */
  incomeOverride?: number | null
  /** Asset keys to exclude entirely (dissipated asset argument). */
  dissipatedAssets?: Set<string>
}

// ---------------------------------------------------------------------------
// Calculator
// ---------------------------------------------------------------------------

export function computeRCP(
  data: FinancialData,
  options: RCPOptions = {}
): RCPResult {
  const breakdown: BreakdownItem[] = []

  // ── Monthly Income ──────────────────────────────────────────────────
  const incomeItems = [
    { label: "Wages / Salary", value: data.wages },
    { label: "Self-Employment", value: data.selfEmployment },
    { label: "Social Security", value: data.socialSecurity },
    { label: "Pension / Annuity", value: data.pension },
    { label: "Rental Income", value: data.rentalIncome },
    { label: "Other Income", value: data.otherIncome },
  ]

  let monthlyIncome = 0
  for (const item of incomeItems) {
    if (item.value > 0) {
      monthlyIncome += item.value
      breakdown.push({
        category: `Income: ${item.label}`,
        amount: item.value,
        notes: "",
      })
    }
  }

  // ── Monthly Expenses ────────────────────────────────────────────────
  const expenseItems = [
    { label: "Housing", value: data.housing },
    { label: "Utilities", value: data.utilities },
    { label: "Transportation", value: data.transportation },
    { label: "Health Insurance", value: data.healthInsurance },
    { label: "Court-Ordered Payments", value: data.courtOrderedPayments },
    { label: "Childcare / Dependent Care", value: data.childcare },
    { label: "Other Expenses", value: data.otherExpenses },
  ]

  let allowableExpenses = 0
  for (const item of expenseItems) {
    if (item.value > 0) {
      allowableExpenses += item.value
      breakdown.push({
        category: `Expense: ${item.label}`,
        amount: -item.value,
        notes: "Allowable per IRS standards",
      })
    }
  }

  // ── Disposable Income ───────────────────────────────────────────────
  const rawDisposable = monthlyIncome - allowableExpenses
  const monthlyDisposable =
    options.incomeOverride != null
      ? options.incomeOverride
      : Math.max(0, rawDisposable)

  const futureIncomeLumpSum = monthlyDisposable * FUTURE_INCOME_LUMP_SUM_MONTHS
  const futureIncomePeriodic = monthlyDisposable * FUTURE_INCOME_PERIODIC_MONTHS

  breakdown.push({
    category: "Monthly Disposable Income",
    amount: monthlyDisposable,
    notes:
      options.incomeOverride != null
        ? `Overridden (raw: $${rawDisposable.toLocaleString()})`
        : rawDisposable < 0
          ? "Negative disposable treated as $0"
          : "",
  })

  // ── Asset Equity ────────────────────────────────────────────────────
  let assetEquity = 0
  const dissipated = options.dissipatedAssets ?? new Set<string>()

  // Bank accounts — no QSV discount
  if (!dissipated.has("bankAccounts") && data.bankAccounts > 0) {
    assetEquity += data.bankAccounts
    breakdown.push({
      category: "Asset: Bank Accounts",
      amount: data.bankAccounts,
      notes: "Full value (no QSV discount)",
    })
  }

  // Investments
  if (!dissipated.has("investments") && data.investments > 0) {
    const qsv = round2(data.investments * QUICK_SALE_MULTIPLIER)
    assetEquity += qsv
    breakdown.push({
      category: "Asset: Investments",
      amount: qsv,
      notes: `FMV $${fmt(data.investments)} × ${pct(QUICK_SALE_MULTIPLIER)} QSV`,
    })
  }

  // Retirement
  if (!options.excludeRetirement && !dissipated.has("retirement") && data.retirement > 0) {
    const qsv = round2(data.retirement * QUICK_SALE_MULTIPLIER)
    assetEquity += qsv
    breakdown.push({
      category: "Asset: Retirement Accounts",
      amount: qsv,
      notes: `FMV $${fmt(data.retirement)} × ${pct(QUICK_SALE_MULTIPLIER)} QSV`,
    })
  } else if (options.excludeRetirement && data.retirement > 0) {
    breakdown.push({
      category: "Asset: Retirement Accounts",
      amount: 0,
      notes: `Excluded (FMV $${fmt(data.retirement)})`,
    })
  }

  // Real estate
  data.realEstate.forEach((prop, i) => {
    const key = `realEstate_${i}`
    if (dissipated.has(key)) return
    const qsv = round2(prop.fmv * QUICK_SALE_MULTIPLIER)
    const equity = Math.max(0, qsv - prop.loan)
    assetEquity += equity
    breakdown.push({
      category: `Asset: Real Estate ${prop.description || `#${i + 1}`}`,
      amount: equity,
      notes: `FMV $${fmt(prop.fmv)} × ${pct(QUICK_SALE_MULTIPLIER)} = $${fmt(qsv)} − loan $${fmt(prop.loan)}`,
    })
  })

  // Vehicles
  const vehicleMultiplier = options.challengeVehicleEquity
    ? CHALLENGED_VEHICLE_MULTIPLIER
    : QUICK_SALE_MULTIPLIER

  data.vehicles.forEach((v, i) => {
    const key = `vehicle_${i}`
    if (dissipated.has(key)) return
    const qsv = round2(v.fmv * vehicleMultiplier)
    const equity = Math.max(0, qsv - v.loan)
    assetEquity += equity
    breakdown.push({
      category: `Asset: Vehicle ${v.description || `#${i + 1}`}`,
      amount: equity,
      notes: options.challengeVehicleEquity
        ? `FMV $${fmt(v.fmv)} × ${pct(vehicleMultiplier)} (challenged) = $${fmt(qsv)} − loan $${fmt(v.loan)}`
        : `FMV $${fmt(v.fmv)} × ${pct(vehicleMultiplier)} = $${fmt(qsv)} − loan $${fmt(v.loan)}`,
    })
  })

  // Other assets
  if (!dissipated.has("otherAssets") && data.otherAssets > 0) {
    const qsv = round2(data.otherAssets * QUICK_SALE_MULTIPLIER)
    assetEquity += qsv
    breakdown.push({
      category: "Asset: Other Assets",
      amount: qsv,
      notes: `FMV $${fmt(data.otherAssets)} × ${pct(QUICK_SALE_MULTIPLIER)} QSV`,
    })
  }

  // Life insurance (cash surrender value)
  if (!dissipated.has("lifeInsurance") && data.lifeInsurance > 0) {
    assetEquity += data.lifeInsurance
    breakdown.push({
      category: "Asset: Life Insurance (CSV)",
      amount: data.lifeInsurance,
      notes: "Cash surrender value — full value",
    })
  }

  // ── Final RCP ───────────────────────────────────────────────────────
  const rcpLumpSum = round2(futureIncomeLumpSum + assetEquity)
  const rcpPeriodic = round2(futureIncomePeriodic + assetEquity)

  return {
    monthlyIncome: round2(monthlyIncome),
    allowableExpenses: round2(allowableExpenses),
    monthlyDisposable: round2(monthlyDisposable),
    futureIncomeLumpSum: round2(futureIncomeLumpSum),
    futureIncomePeriodic: round2(futureIncomePeriodic),
    assetEquity: round2(assetEquity),
    rcpLumpSum,
    rcpPeriodic,
    breakdown,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
