/**
 * OIC Working Papers — Merge + Compute + Validate
 *
 * Takes the static template + AI-extracted data and produces
 * a fully populated working paper with computed formulas.
 */

import { OIC_TEMPLATE, type WorkingPaperTemplate, type TemplateField } from "./oic-working-papers"

export interface ExtractedData {
  [key: string]: any
}

export interface ValidationIssue {
  key: string
  label: string
  issue: string
  severity: "error" | "warning" | "info"
}

export interface MergedField {
  key: string
  label: string
  value: string | number | null
  type: string
  flag?: string        // VERIFY | PRACTITIONER_JUDGMENT | MISSING
  computed?: boolean   // true if this was a formula result
}

export interface MergedSection {
  title: string
  fields: MergedField[]
}

export interface MergedTab {
  name: string
  sections: MergedSection[]
}

export interface MergeResult {
  tabs: MergedTab[]
  validationIssues: ValidationIssue[]
  extractedArrays: {
    bank_accounts: any[]
    retirement_accounts: any[]
    dependents: any[]
    tax_liability: any[]
  }
  summary: {
    totalAssetEquity: number
    monthlyNetIncome: number
    rcpLump: number
    rcpPeriodic: number
    totalLiability: number
  }
}

// --- Validation ---

const CURRENCY_RANGES: Record<string, [number, number]> = {
  wages_tp1: [0, 50000],
  wages_tp2: [0, 50000],
  social_security: [0, 5000],
  pension_income: [0, 20000],
  expense_food_clothing: [0, 3000],
  expense_housing_utilities: [0, 10000],
  expense_health_insurance: [0, 5000],
  total_bank_balances: [0, 10000000],
  real_estate_fmv: [0, 10000000],
  vehicles_fmv: [0, 500000],
  total_tax_liability: [0, 50000000],
}

export function validateExtractedData(data: ExtractedData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Check required fields
  if (!data.taxpayer1_name) {
    issues.push({ key: "taxpayer1_name", label: "Taxpayer 1 Name", issue: "Missing — required for OIC filing", severity: "error" })
  }
  if (!data.filing_status) {
    issues.push({ key: "filing_status", label: "Filing Status", issue: "Missing — required for OIC filing", severity: "error" })
  }
  if (!data.tax_liability || data.tax_liability.length === 0) {
    issues.push({ key: "tax_liability", label: "Tax Liability", issue: "No tax periods found in documents", severity: "error" })
  }

  // Range checks on currency values
  for (const [key, [min, max]] of Object.entries(CURRENCY_RANGES)) {
    const val = data[key]
    if (val != null && typeof val === "number") {
      if (val < min || val > max) {
        issues.push({
          key,
          label: key.replace(/_/g, " "),
          issue: `Value $${val.toLocaleString()} is outside expected range ($${min.toLocaleString()} - $${max.toLocaleString()})`,
          severity: "warning",
        })
      }
    }
  }

  // Type checks
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith("expense_") || key.startsWith("wages") || key === "social_security" || key === "pension_income") {
      if (val != null && typeof val !== "number" && typeof val !== "string") {
        issues.push({ key, label: key, issue: `Expected number, got ${typeof val}`, severity: "warning" })
      }
    }
  }

  // Check for verify flags from AI
  if (data.verify_flags && Array.isArray(data.verify_flags)) {
    for (const flag of data.verify_flags) {
      issues.push({ key: "verify", label: "AI Verify Flag", issue: flag, severity: "warning" })
    }
  }

  // Check for missing data
  if (data.missing_data && Array.isArray(data.missing_data)) {
    for (const item of data.missing_data) {
      issues.push({ key: "missing", label: "Missing Data", issue: item, severity: "info" })
    }
  }

  return issues
}

// --- Formula Computation ---

function toNum(val: any): number {
  if (val == null) return 0
  if (typeof val === "number") return val
  const parsed = parseFloat(String(val).replace(/[$,]/g, ""))
  return isNaN(parsed) ? 0 : parsed
}

function computeFormulas(data: ExtractedData): Record<string, number> {
  const d = (key: string) => toNum(data[key])

  // Income totals
  const totalMonthlyIncome =
    d("wages_tp1") + d("wages_tp2") + d("social_security") + d("pension_income") +
    d("interest_income") + d("dividend_income") + d("rental_income_net") +
    d("distribution_income") + d("child_support_received") + d("alimony_received") +
    d("other_income")

  // Expense totals
  const totalMonthlyExpenses =
    d("expense_food_clothing") + d("expense_housing_utilities") +
    d("expense_vehicle_payment_1") + d("expense_vehicle_payment_2") +
    d("expense_vehicle_operating") + d("expense_public_transportation") +
    d("expense_health_insurance") + d("expense_health_oop") +
    d("expense_court_ordered") + d("expense_child_care") +
    d("expense_life_insurance") + d("expense_current_taxes") +
    d("expense_secured_debts") + d("expense_other")

  const netMonthlyIncome = totalMonthlyIncome - totalMonthlyExpenses

  // Life insurance net
  const lifeInsNet = d("life_insurance_cash_value") - d("life_insurance_loan_balance")

  // Real estate: FMV × 0.80 - loan balance
  const reQsv = d("real_estate_fmv") * 0.20
  const reNetEquity = Math.max(0, d("real_estate_fmv") * 0.80 - d("real_estate_loan_balance"))

  // Vehicles: FMV × 0.80 - loan balance
  const vehQsv = d("vehicles_fmv") * 0.20
  const vehNetEquity = Math.max(0, d("vehicles_fmv") * 0.80 - d("vehicles_loan_balance"))

  // Personal asset equity
  const totalPersonalAssets =
    d("cash_on_hand") + d("total_bank_balances") + d("investment_accounts") +
    Math.max(0, lifeInsNet) + reNetEquity + vehNetEquity +
    d("digital_assets") + d("other_personal_assets")

  // Business equipment
  const equipQsv = d("biz_equipment_fmv") * 0.20
  const equipNet = Math.max(0, d("biz_equipment_fmv") * 0.80 - d("biz_equipment_loan_balance"))

  // Business vehicles
  const bizVehQsv = d("biz_vehicles_fmv") * 0.20
  const bizVehNet = Math.max(0, d("biz_vehicles_fmv") * 0.80 - d("biz_vehicles_loan_balance"))

  // Business real estate
  const bizReQsv = d("biz_real_estate_fmv") * 0.20
  const bizReNet = Math.max(0, d("biz_real_estate_fmv") * 0.80 - d("biz_real_estate_loan"))

  // Business income
  const bizTotalIncome =
    d("biz_gross_receipts") + d("biz_rental_income") + d("biz_interest_income") +
    d("biz_dividend_income") + d("biz_other_income")

  const bizTotalExpenses =
    d("biz_expense_materials") + d("biz_expense_wages") + d("biz_expense_rent") +
    d("biz_expense_supplies") + d("biz_expense_utilities") + d("biz_expense_vehicle") +
    d("biz_expense_insurance") + d("biz_expense_taxes") + d("biz_expense_other")

  const bizNetIncome = bizTotalIncome - bizTotalExpenses

  // Business asset equity
  const totalBusinessAssets =
    d("biz_cash_on_hand") + d("biz_total_bank_balances") + d("biz_accounts_receivable_total") +
    equipNet + bizVehNet + bizReNet +
    d("biz_intangibles") + d("biz_other_assets")

  // Total asset equity
  const totalAssetEquity = totalPersonalAssets + totalBusinessAssets

  // Future income (use max of 0 — can't be negative)
  const monthlyRemaining = Math.max(0, netMonthlyIncome)
  const futureIncome12 = monthlyRemaining * 12
  const futureIncome24 = monthlyRemaining * 24

  // RCP
  const rcpLump = totalAssetEquity + futureIncome12
  const rcpPeriodic = totalAssetEquity + futureIncome24

  return {
    // Income & Expense
    SUM_INCOME: totalMonthlyIncome,
    SUM_EXPENSES: totalMonthlyExpenses,
    NET_INCOME: netMonthlyIncome,

    // Personal assets
    LIFE_INS_NET: lifeInsNet,
    QSV_RE: reQsv,
    NET_RE_EQUITY: reNetEquity,
    QSV_VEH: vehQsv,
    NET_VEH_EQUITY: vehNetEquity,
    SUM_PERSONAL_ASSETS: totalPersonalAssets,

    // Business
    SUM_BIZ_INCOME: bizTotalIncome,
    SUM_BIZ_EXPENSES: bizTotalExpenses,
    NET_BIZ_INCOME: bizNetIncome,
    QSV_EQUIP: equipQsv,
    NET_EQUIP: equipNet,
    QSV_BIZ_VEH: bizVehQsv,
    NET_BIZ_VEH: bizVehNet,
    QSV_BIZ_RE: bizReQsv,
    NET_BIZ_RE: bizReNet,
    SUM_BUSINESS_ASSETS: totalBusinessAssets,

    // Summary
    TOTAL_ASSETS: totalAssetEquity,
    FUTURE_INCOME_12: futureIncome12,
    FUTURE_INCOME_24: futureIncome24,
    RCP_LUMP: rcpLump,
    RCP_PERIODIC: rcpPeriodic,
  }
}

// --- Merge ---

function resolveField(
  field: TemplateField,
  data: ExtractedData,
  formulas: Record<string, number>
): MergedField {
  if (field.type === "formula" && field.formula) {
    const value = formulas[field.formula] ?? 0
    return {
      key: field.key,
      label: field.label,
      value: Math.round(value * 100) / 100,
      type: field.type,
      flag: field.flag,
      computed: true,
    }
  }

  const rawValue = data[field.key]

  // Determine flag
  let flag = field.flag
  if (rawValue == null && field.required) {
    flag = "MISSING"
  } else if (typeof rawValue === "string" && rawValue.includes("[VERIFY]")) {
    flag = "VERIFY"
  }

  // Format value
  let value: string | number | null = rawValue ?? null
  if (field.type === "currency" && typeof rawValue === "number") {
    value = Math.round(rawValue * 100) / 100
  }

  return {
    key: field.key,
    label: field.label,
    value,
    type: field.type,
    flag,
  }
}

export function mergeTemplateWithData(data: ExtractedData): MergeResult {
  const template = OIC_TEMPLATE
  const formulas = computeFormulas(data)
  const validationIssues = validateExtractedData(data)

  const tabs: MergedTab[] = template.tabs.map((tab) => ({
    name: tab.name,
    sections: tab.sections.map((section) => ({
      title: section.title,
      fields: section.fields.map((field) => resolveField(field, data, formulas)),
    })),
  }))

  return {
    tabs,
    validationIssues,
    extractedArrays: {
      bank_accounts: data.bank_accounts || [],
      retirement_accounts: data.retirement_accounts || [],
      dependents: data.dependents || [],
      tax_liability: data.tax_liability || [],
    },
    summary: {
      totalAssetEquity: formulas.TOTAL_ASSETS,
      monthlyNetIncome: formulas.NET_INCOME,
      rcpLump: formulas.RCP_LUMP,
      rcpPeriodic: formulas.RCP_PERIODIC,
      totalLiability: toNum(data.total_tax_liability),
    },
  }
}

/**
 * Convert merged result to the spreadsheet tab format used by the existing
 * spreadsheet editor and Excel export.
 */
export function mergedToSpreadsheetData(merged: MergeResult): {
  name: string
  columns: string[]
  rows: string[][]
}[] {
  const tabs = merged.tabs.map((tab) => {
    const rows: string[][] = []

    for (const section of tab.sections) {
      // Section header row
      rows.push([section.title, "", ""])

      for (const field of section.fields) {
        const valueStr = field.value != null ? String(field.value) : ""
        const flagStr = field.flag ? `[${field.flag}]` : ""
        const computedStr = field.computed ? "(calculated)" : ""
        rows.push([
          field.label,
          field.type === "currency" && typeof field.value === "number"
            ? `$${field.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
            : valueStr,
          [flagStr, computedStr].filter(Boolean).join(" "),
        ])
      }

      // Blank row between sections
      rows.push(["", "", ""])
    }

    return {
      name: tab.name,
      columns: ["Item", "Value", "Notes"],
      rows,
    }
  })

  // Add array data tabs (liability periods, bank accounts, etc.)
  if (merged.extractedArrays.tax_liability.length > 0) {
    const liabilityRows = merged.extractedArrays.tax_liability.map((p: any) => [
      String(p.year || ""),
      String(p.form || ""),
      p.assessed != null ? `$${Number(p.assessed).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "",
      p.penalties != null ? `$${Number(p.penalties).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "",
      p.interest != null ? `$${Number(p.interest).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "",
      p.total != null ? `$${Number(p.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "",
      String(p.csed || "[VERIFY]"),
    ])
    tabs.splice(1, 0, {
      name: "Liability Summary",
      columns: ["Tax Year", "Form", "Assessed", "Penalties", "Interest", "Total", "CSED"],
      rows: liabilityRows,
    })
  }

  return tabs
}
