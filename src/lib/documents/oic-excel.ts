/**
 * OIC Working Papers — Purpose-built Excel generator with REAL FORMULAS.
 *
 * Every computed cell uses an Excel formula with cell references so the
 * practitioner can change any input and see downstream values recalculate.
 *
 * Color coding:
 *   Light blue  (#E8F4FD) = editable input cell
 *   Light gray  (#F0F0F0) = formula cell (don't edit)
 *   Yellow      (#FFFFF3) = [VERIFY] flag
 *   Blue        (#E8F0FF) = [PRACTITIONER JUDGMENT] flag
 *   Red         (#FFE0E0) = missing/required data
 *   Navy        (#1B2A4A) = section headers
 */
import ExcelJS from "exceljs"
import type { MergeResult } from "@/lib/templates/oic-merge"
import { formatDate } from "@/lib/date-utils"

// ─── Constants ───────────────────────────────────────────────────
const FONT = "Times New Roman"
const NAVY = "FF1B2A4A"
const INPUT_BG = "FFE8F4FD"
const FORMULA_BG = "FFF0F0F0"
const VERIFY_BG = "FFFFFFD0"
const JUDGMENT_BG = "FFE8F0FF"
const MISSING_BG = "FFFFE0E0"
const CURRENCY_FMT = '$#,##0.00'
const PERCENT_FMT = '0.00%'

const thinBorder: ExcelJS.Border = { style: "thin", color: { argb: "FFB0C4D8" } }
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
}

type ExtractedData = Record<string, any>

// ─── Helpers ─────────────────────────────────────────────────────

function toNum(val: any): number {
  if (val == null) return 0
  if (typeof val === "number") return val
  const parsed = parseFloat(String(val).replace(/[$,]/g, ""))
  return isNaN(parsed) ? 0 : parsed
}

function styleSheet(ws: ExcelJS.Worksheet, tabsNumber: string) {
  ws.headerFooter.oddHeader = `&L&"${FONT}"&8CLEARED \u2014 ${tabsNumber}`
  ws.headerFooter.oddFooter = `&C&"${FONT}"&8Confidential`
  ws.pageSetup.fitToPage = true
  ws.pageSetup.fitToWidth = 1
  ws.pageSetup.fitToHeight = 0
  ws.pageSetup.orientation = "landscape"
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, colSpan: number) {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: FONT, bold: true, size: 11, color: { argb: "FFFFFFFF" } }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
  cell.alignment = { horizontal: "left", vertical: "middle" }
  for (let c = 1; c <= colSpan; c++) {
    const sc = ws.getCell(row, c)
    sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    sc.border = allBorders
    if (c > 1) sc.font = { name: FONT, size: 10, color: { argb: "FFFFFFFF" } }
  }
  ws.getRow(row).height = 22
}

function labelCell(ws: ExcelJS.Worksheet, row: number, col: number, text: string, bold = false) {
  const cell = ws.getCell(row, col)
  cell.value = text
  cell.font = { name: FONT, size: 10, bold }
  cell.alignment = { vertical: "middle", wrapText: true }
  cell.border = allBorders
}

function inputCell(ws: ExcelJS.Worksheet, row: number, col: number, value: any, fmt?: string, flag?: string) {
  const cell = ws.getCell(row, col)
  cell.value = value ?? null
  cell.font = { name: FONT, size: 10 }
  cell.alignment = { vertical: "middle" }
  cell.border = allBorders
  if (fmt) cell.numFmt = fmt

  let bg = INPUT_BG
  if (flag === "VERIFY") bg = VERIFY_BG
  else if (flag === "PRACTITIONER_JUDGMENT") bg = JUDGMENT_BG
  else if (flag === "MISSING") bg = MISSING_BG
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }

  // Unlock for editing
  cell.protection = { locked: false }
}

function formulaCell(
  ws: ExcelJS.Worksheet, row: number, col: number,
  formula: string, result: number, fmt?: string
) {
  const cell = ws.getCell(row, col)
  cell.value = { formula, result }
  cell.font = { name: FONT, size: 10, bold: true }
  cell.alignment = { vertical: "middle" }
  cell.border = allBorders
  cell.numFmt = fmt || CURRENCY_FMT
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FORMULA_BG } }
  cell.protection = { locked: true }
}

function noteCell(ws: ExcelJS.Worksheet, row: number, col: number, text: string) {
  const cell = ws.getCell(row, col)
  cell.value = text
  cell.font = { name: FONT, size: 9, italic: true, color: { argb: "FF666666" } }
  cell.alignment = { vertical: "middle", wrapText: true }
  cell.border = allBorders
}

function colHeaderRow(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  for (let c = 0; c < headers.length; c++) {
    const cell = ws.getCell(row, c + 1)
    cell.value = headers[c]
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = allBorders
  }
  ws.getRow(row).height = 20
}

// ─── Sheet Builders ──────────────────────────────────────────────

function buildCover(
  wb: ExcelJS.Workbook, tabsNumber: string, clientName: string
) {
  const ws = wb.addWorksheet("Cover")
  styleSheet(ws, tabsNumber)

  ws.getCell("A1").value = "CLEARED"
  ws.getCell("A1").font = { name: FONT, bold: true, size: 20, color: { argb: NAVY } }
  ws.getCell("A2").value = "Offer in Compromise Working Papers"
  ws.getCell("A2").font = { name: FONT, bold: true, size: 14, color: { argb: "FF2E75B6" } }
  ws.getCell("A4").value = `Case: ${tabsNumber}`
  ws.getCell("A4").font = { name: FONT, size: 12 }
  ws.getCell("A5").value = `Client: ${clientName}`
  ws.getCell("A5").font = { name: FONT, size: 12 }
  ws.getCell("A6").value = `Generated: ${formatDate(new Date(), { year: "numeric", month: "long", day: "numeric" })}`
  ws.getCell("A6").font = { name: FONT, size: 11, color: { argb: "FF666666" } }
  ws.getCell("A8").value = "DRAFT \u2014 Requires Practitioner Review and Approval"
  ws.getCell("A8").font = { name: FONT, bold: true, color: { argb: "FFCC0000" }, size: 12 }

  // Color legend
  ws.getCell("A10").value = "Color Legend:"
  ws.getCell("A10").font = { name: FONT, bold: true, size: 10 }
  const legend: [string, string][] = [
    [INPUT_BG, "Light Blue = Editable Input (change these values)"],
    [FORMULA_BG, "Gray = Formula (auto-calculated, do not edit)"],
    [VERIFY_BG, "Yellow = [VERIFY] \u2014 AI flagged for verification"],
    [JUDGMENT_BG, "Blue = [PRACTITIONER JUDGMENT] \u2014 requires professional decision"],
    [MISSING_BG, "Red = Missing data \u2014 required for filing"],
  ]
  for (let i = 0; i < legend.length; i++) {
    const r = 11 + i
    ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: legend[i][0] } }
    ws.getCell(r, 1).border = allBorders
    ws.getCell(r, 2).value = legend[i][1]
    ws.getCell(r, 2).font = { name: FONT, size: 10 }
  }

  ws.getColumn(1).width = 15
  ws.getColumn(2).width = 55
}

function buildSummary(
  wb: ExcelJS.Workbook, data: ExtractedData, summary: MergeResult["summary"],
  tabsNumber: string
) {
  const ws = wb.addWorksheet("Summary")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 20
  ws.getColumn(3).width = 30

  let r = 1
  sectionHeader(ws, r, "OFFER IN COMPROMISE \u2014 RCP SUMMARY", 3)
  r += 2

  // Total tax liability — references Liability sheet
  labelCell(ws, r, 1, "Total Tax Liability")
  formulaCell(ws, r, 2, "'Liability'!F" + "TOTAL", summary.totalLiability)
  // We'll use a named range for this; for now, cross-sheet formula placeholder
  // Actual formula set after liability sheet is built
  r++

  r++ // blank
  sectionHeader(ws, r, "ASSET EQUITY", 3)
  r++
  labelCell(ws, r, 1, "Net Personal Asset Equity")
  // References the total on Personal Assets sheet
  formulaCell(ws, r, 2, "'Personal Assets'!PERSONAL_EQUITY", summary.totalAssetEquity - (summary.totalAssetEquity - toNum(data._personalAssetEquity || 0)))
  const personalEquityRow = r
  r++

  labelCell(ws, r, 1, "Net Business Asset Equity")
  formulaCell(ws, r, 2, "'Business Assets'!BUSINESS_EQUITY", 0)
  const businessEquityRow = r
  r++

  labelCell(ws, r, 1, "Total Asset Equity")
  formulaCell(ws, r, 2, `B${personalEquityRow}+B${businessEquityRow}`, summary.totalAssetEquity)
  const totalEquityRow = r
  r++

  r++ // blank
  sectionHeader(ws, r, "FUTURE INCOME", 3)
  r++
  labelCell(ws, r, 1, "Monthly Disposable Income")
  // References Personal I&E net remaining
  formulaCell(ws, r, 2, "'Personal I&E'!IE_NET", summary.monthlyNetIncome)
  const monthlyIncomeRow = r
  r++

  labelCell(ws, r, 1, "Lump Sum Multiplier")
  inputCell(ws, r, 2, 12, "#,##0")
  noteCell(ws, r, 3, "Standard: 12 months (editable)")
  const lumpMultRow = r
  r++

  labelCell(ws, r, 1, "Periodic Payment Multiplier")
  inputCell(ws, r, 2, 24, "#,##0")
  noteCell(ws, r, 3, "Standard: 24 months (editable)")
  const periodicMultRow = r
  r++

  labelCell(ws, r, 1, "Future Income (Lump Sum)")
  formulaCell(ws, r, 2, `B${monthlyIncomeRow}*B${lumpMultRow}`, Math.max(0, summary.monthlyNetIncome) * 12)
  const futureLumpRow = r
  r++

  labelCell(ws, r, 1, "Future Income (Periodic)")
  formulaCell(ws, r, 2, `B${monthlyIncomeRow}*B${periodicMultRow}`, Math.max(0, summary.monthlyNetIncome) * 24)
  const futurePeriodicRow = r
  r++

  r++ // blank
  sectionHeader(ws, r, "REASONABLE COLLECTION POTENTIAL (RCP)", 3)
  r++
  labelCell(ws, r, 1, "RCP \u2014 Lump Sum", true)
  formulaCell(ws, r, 2, `B${totalEquityRow}+B${futureLumpRow}`, summary.rcpLump)
  r++

  labelCell(ws, r, 1, "RCP \u2014 Periodic Payment", true)
  formulaCell(ws, r, 2, `B${totalEquityRow}+B${futurePeriodicRow}`, summary.rcpPeriodic)
  r++

  r++ // blank
  sectionHeader(ws, r, "OFFER RECOMMENDATION", 3)
  r++
  labelCell(ws, r, 1, "Recommended Offer Type")
  inputCell(ws, r, 2, data.recommended_offer_type || "", undefined, "PRACTITIONER_JUDGMENT")
  noteCell(ws, r, 3, "[PRACTITIONER JUDGMENT]")
  r++

  labelCell(ws, r, 1, "Recommended Offer Amount")
  inputCell(ws, r, 2, toNum(data.recommended_offer_amount), CURRENCY_FMT, "PRACTITIONER_JUDGMENT")
  noteCell(ws, r, 3, "[PRACTITIONER JUDGMENT]")
  const offerAmountRow = r
  r++

  labelCell(ws, r, 1, "20% Initial Payment (Lump Sum)")
  formulaCell(ws, r, 2, `B${offerAmountRow}*0.2`, toNum(data.recommended_offer_amount) * 0.2)
  r++

  // We'll fix the cross-sheet references after all sheets are built
  return { ws, personalEquityRow, businessEquityRow, monthlyIncomeRow }
}

function buildLiability(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
): { totalRow: number; totalCol: string } {
  const ws = wb.addWorksheet("Liability")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 10
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18
  ws.getColumn(5).width = 18
  ws.getColumn(6).width = 18
  ws.getColumn(7).width = 16

  let r = 1
  sectionHeader(ws, r, "TAX LIABILITY SUMMARY", 7)
  r++
  colHeaderRow(ws, r, ["Tax Year", "Form", "Assessed", "Penalties", "Interest", "Total", "CSED"])
  r++

  const liabilities: any[] = data.tax_liability || []
  const dataStartRow = r

  if (liabilities.length > 0) {
    for (const period of liabilities) {
      inputCell(ws, r, 1, period.year || period.tax_year || "")
      inputCell(ws, r, 2, period.form || period.form_type || "1040")
      inputCell(ws, r, 3, toNum(period.assessed || period.original_assessment), CURRENCY_FMT)
      inputCell(ws, r, 4, toNum(period.penalties), CURRENCY_FMT)
      inputCell(ws, r, 5, toNum(period.interest), CURRENCY_FMT)
      // Total = Assessed + Penalties + Interest
      formulaCell(ws, r, 6, `C${r}+D${r}+E${r}`,
        toNum(period.assessed || period.original_assessment) + toNum(period.penalties) + toNum(period.interest))
      inputCell(ws, r, 7, period.csed || "", undefined, period.csed ? undefined : "VERIFY")
      r++
    }
  } else {
    // Placeholder rows for manual entry
    for (let i = 0; i < 5; i++) {
      inputCell(ws, r, 1, null)
      inputCell(ws, r, 2, null)
      inputCell(ws, r, 3, null, CURRENCY_FMT)
      inputCell(ws, r, 4, null, CURRENCY_FMT)
      inputCell(ws, r, 5, null, CURRENCY_FMT)
      formulaCell(ws, r, 6, `C${r}+D${r}+E${r}`, 0)
      inputCell(ws, r, 7, null)
      r++
    }
  }

  const dataEndRow = r - 1

  // TOTAL row
  r++
  labelCell(ws, r, 1, "TOTAL", true)
  labelCell(ws, r, 2, "", true)
  formulaCell(ws, r, 3, `SUM(C${dataStartRow}:C${dataEndRow})`,
    liabilities.reduce((s: number, p: any) => s + toNum(p.assessed || p.original_assessment), 0))
  formulaCell(ws, r, 4, `SUM(D${dataStartRow}:D${dataEndRow})`,
    liabilities.reduce((s: number, p: any) => s + toNum(p.penalties), 0))
  formulaCell(ws, r, 5, `SUM(E${dataStartRow}:E${dataEndRow})`,
    liabilities.reduce((s: number, p: any) => s + toNum(p.interest), 0))
  formulaCell(ws, r, 6, `SUM(F${dataStartRow}:F${dataEndRow})`,
    liabilities.reduce((s: number, p: any) => s + toNum(p.assessed || p.original_assessment) + toNum(p.penalties) + toNum(p.interest), 0))

  const totalRow = r

  // Define named range for total liability
  wb.definedNames.add(`'Liability'!$F$${totalRow}`, "LIABILITY_TOTAL")

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })

  return { totalRow, totalCol: "F" }
}

function buildTPInfo(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
) {
  const ws = wb.addWorksheet("TP Info")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 35
  ws.getColumn(2).width = 35
  ws.getColumn(3).width = 30

  let r = 1
  sectionHeader(ws, r, "TAXPAYER INFORMATION", 3)
  r++
  const tpFields: [string, string, string?][] = [
    ["Taxpayer 1 Name", "taxpayer1_name"],
    ["Taxpayer 2 Name (if MFJ)", "taxpayer2_name"],
    ["Filing Status", "filing_status"],
    ["Address", "address"],
    ["County", "county"],
  ]
  for (const [label, key] of tpFields) {
    labelCell(ws, r, 1, label)
    const val = data[key]
    const flag = !val && (key === "taxpayer1_name" || key === "filing_status") ? "MISSING" : undefined
    inputCell(ws, r, 2, val || "", undefined, flag)
    r++
  }

  // Dependents
  r++
  sectionHeader(ws, r, "DEPENDENTS", 3)
  r++
  colHeaderRow(ws, r, ["Name", "Age / Relationship", "Income"])
  r++
  const deps = data.dependents || []
  if (Array.isArray(deps) && deps.length > 0) {
    for (const dep of deps) {
      inputCell(ws, r, 1, dep.name || "")
      inputCell(ws, r, 2, `${dep.age || ""} / ${dep.relationship || ""}`)
      inputCell(ws, r, 3, toNum(dep.income), CURRENCY_FMT)
      r++
    }
  } else {
    for (let i = 0; i < 3; i++) {
      inputCell(ws, r, 1, null); inputCell(ws, r, 2, null); inputCell(ws, r, 3, null, CURRENCY_FMT)
      r++
    }
  }

  // Employment
  r++
  sectionHeader(ws, r, "EMPLOYMENT", 3)
  r++
  const empFields: [string, string][] = [
    ["TP1 Employer", "tp1_employer"],
    ["TP1 Occupation", "tp1_occupation"],
    ["TP1 How Long Employed", "tp1_employment_length"],
    ["TP2 Employer", "tp2_employer"],
    ["TP2 Occupation", "tp2_occupation"],
    ["TP2 How Long Employed", "tp2_employment_length"],
  ]
  for (const [label, key] of empFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, data[key] || "")
    r++
  }

  // Self-Employment
  r++
  sectionHeader(ws, r, "SELF-EMPLOYMENT", 3)
  r++
  const seFields: [string, string, string?][] = [
    ["Self-Employed?", "self_employed"],
    ["Business Name", "business_name"],
    ["Business EIN", "business_ein"],
    ["Business Address", "business_address"],
    ["Entity Type", "business_type"],
    ["Number of Employees", "num_employees"],
    ["Average Monthly Payroll", "avg_monthly_payroll"],
  ]
  for (const [label, key] of seFields) {
    labelCell(ws, r, 1, label)
    const val = data[key]
    const fmt = key === "avg_monthly_payroll" ? CURRENCY_FMT : undefined
    inputCell(ws, r, 2, val ?? "", fmt)
    r++
  }

  // 433-A Questionnaire
  r++
  sectionHeader(ws, r, "FORM 433-A QUESTIONNAIRE", 3)
  r++
  const qFields: [string, string, string?][] = [
    ["Any lawsuits pending?", "q_lawsuits_pending"],
    ["Filed bankruptcy in last 10 years?", "q_bankruptcy_filed"],
    ["Involved in any IRS litigation?", "q_irs_litigation"],
    ["Beneficiary of a trust or estate?", "q_trust_beneficiary"],
    ["Life insurance policies?", "q_life_insurance"],
    ["Safe deposit box?", "q_safe_deposit_box"],
    ["Asset transfers in last 10 years?", "q_asset_transfers", "PRACTITIONER_JUDGMENT"],
  ]
  for (const [label, key, flag] of qFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, data[key] || "", undefined, flag)
    if (flag) noteCell(ws, r, 3, `[${flag.replace("_", " ")}]`)
    r++
  }

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
}

function buildPersonalIE(
  wb: ExcelJS.Workbook, data: ExtractedData, summary: MergeResult["summary"],
  tabsNumber: string
): { netRow: number } {
  const ws = wb.addWorksheet("Personal I&E")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18
  ws.getColumn(5).width = 25

  let r = 1
  // ─── INCOME ───
  sectionHeader(ws, r, "MONTHLY INCOME", 5)
  r++
  colHeaderRow(ws, r, ["Description", "Monthly Amount", "", "Source", ""])
  r++

  const incomeFields: [string, string][] = [
    ["Wages/Salary \u2014 TP1", "wages_tp1"],
    ["Wages/Salary \u2014 TP2", "wages_tp2"],
    ["Social Security", "social_security"],
    ["Pensions", "pension_income"],
    ["Interest Income", "interest_income"],
    ["Dividend Income", "dividend_income"],
    ["Net Rental Income", "rental_income_net"],
    ["Distributions from Business", "distribution_income"],
    ["Child Support Received", "child_support_received"],
    ["Alimony Received", "alimony_received"],
    ["Other Income", "other_income"],
  ]

  const incomeStartRow = r
  for (const [label, key] of incomeFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, toNum(data[key]) || null, CURRENCY_FMT)
    r++
  }
  const incomeEndRow = r - 1

  // TOTAL INCOME
  labelCell(ws, r, 1, "TOTAL MONTHLY INCOME", true)
  const totalIncomeResult = incomeFields.reduce((s, [, key]) => s + toNum(data[key]), 0)
  formulaCell(ws, r, 2, `SUM(B${incomeStartRow}:B${incomeEndRow})`, totalIncomeResult)
  const totalIncomeRow = r
  r++

  // ─── EXPENSES ───
  r++
  sectionHeader(ws, r, "MONTHLY EXPENSES (IRS Collection Financial Standards)", 5)
  r++
  colHeaderRow(ws, r, ["Description", "Claimed Amount", "IRS Standard", "Variance", "Notes"])
  r++

  const expenseFields: [string, string][] = [
    ["Food, Clothing & Misc (National Standard)", "expense_food_clothing"],
    ["Housing & Utilities (Local Standard)", "expense_housing_utilities"],
    ["Vehicle Payment 1", "expense_vehicle_payment_1"],
    ["Vehicle Payment 2", "expense_vehicle_payment_2"],
    ["Vehicle Operating Costs (Local Standard)", "expense_vehicle_operating"],
    ["Public Transportation", "expense_public_transportation"],
    ["Health Insurance", "expense_health_insurance"],
    ["Out-of-Pocket Health Costs", "expense_health_oop"],
    ["Court-Ordered Payments", "expense_court_ordered"],
    ["Child/Dependent Care", "expense_child_care"],
    ["Term Life Insurance", "expense_life_insurance"],
    ["Current Year Taxes", "expense_current_taxes"],
    ["Secured Debts (student loans, etc.)", "expense_secured_debts"],
    ["Other Necessary Expenses", "expense_other"],
  ]

  const expStartRow = r
  for (const [label, key] of expenseFields) {
    labelCell(ws, r, 1, label)
    const flag = key === "expense_other" ? "PRACTITIONER_JUDGMENT" : undefined
    inputCell(ws, r, 2, toNum(data[key]) || null, CURRENCY_FMT, flag)
    // IRS Standard column — input for practitioner
    inputCell(ws, r, 3, null, CURRENCY_FMT)
    // Variance = Claimed - IRS Standard
    formulaCell(ws, r, 4, `B${r}-C${r}`, toNum(data[key]))
    if (flag) noteCell(ws, r, 5, "[PRACTITIONER JUDGMENT]")
    r++
  }
  const expEndRow = r - 1

  // Other expenses description
  labelCell(ws, r, 1, "Other Expenses Description")
  inputCell(ws, r, 2, data.expense_other_description || "")
  r++

  // TOTAL EXPENSES
  labelCell(ws, r, 1, "TOTAL MONTHLY EXPENSES", true)
  const totalExpResult = expenseFields.reduce((s, [, key]) => s + toNum(data[key]), 0)
  formulaCell(ws, r, 2, `SUM(B${expStartRow}:B${expEndRow})`, totalExpResult)
  formulaCell(ws, r, 3, `SUM(C${expStartRow}:C${expEndRow})`, 0)
  formulaCell(ws, r, 4, `B${r}-C${r}`, totalExpResult)
  const totalExpRow = r
  r++

  // NET
  r++
  labelCell(ws, r, 1, "NET MONTHLY REMAINING INCOME", true)
  formulaCell(ws, r, 2, `B${totalIncomeRow}-B${totalExpRow}`, summary.monthlyNetIncome)
  const netRow = r

  // Named range for Summary to reference
  wb.definedNames.add(`'Personal I&E'!$B$${netRow}`, "IE_NET")

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
  return { netRow }
}

function buildPersonalAssets(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
): { equityRow: number } {
  const ws = wb.addWorksheet("Personal Assets")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18
  ws.getColumn(5).width = 18
  ws.getColumn(6).width = 25

  let r = 1

  // ─── BANK ACCOUNTS ───
  sectionHeader(ws, r, "CASH & BANK ACCOUNTS", 6)
  r++
  colHeaderRow(ws, r, ["Institution", "Account Type", "Balance", "", "", ""])
  r++

  labelCell(ws, r, 1, "Cash on Hand")
  inputCell(ws, r, 3, toNum(data.cash_on_hand) || null, CURRENCY_FMT)
  const cashRow = r
  r++

  const bankAccounts = data.bank_accounts || []
  const bankStartRow = r
  if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
    for (const acct of bankAccounts) {
      inputCell(ws, r, 1, acct.institution || "")
      inputCell(ws, r, 2, acct.type || "")
      inputCell(ws, r, 3, toNum(acct.balance), CURRENCY_FMT, "VERIFY")
      r++
    }
  } else {
    for (let i = 0; i < 3; i++) {
      inputCell(ws, r, 1, null); inputCell(ws, r, 2, null); inputCell(ws, r, 3, null, CURRENCY_FMT)
      r++
    }
  }
  const bankEndRow = r - 1

  labelCell(ws, r, 1, "TOTAL BANK BALANCES", true)
  formulaCell(ws, r, 3, `SUM(C${bankStartRow}:C${bankEndRow})`,
    Array.isArray(bankAccounts) ? bankAccounts.reduce((s: number, a: any) => s + toNum(a.balance), 0) : toNum(data.total_bank_balances))
  const bankTotalRow = r
  r++

  // ─── REAL ESTATE ───
  r++
  sectionHeader(ws, r, "REAL ESTATE", 6)
  r++
  colHeaderRow(ws, r, ["Property", "FMV", "QSV (80%)", "Mortgage/Loan", "Net Equity", "Notes"])
  r++

  const reDesc = data.real_estate || "Primary Residence"
  inputCell(ws, r, 1, reDesc)
  inputCell(ws, r, 2, toNum(data.real_estate_fmv) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 3, `B${r}*0.8`, toNum(data.real_estate_fmv) * 0.8)
  inputCell(ws, r, 4, toNum(data.real_estate_loan_balance) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, Math.max(0, toNum(data.real_estate_fmv) * 0.8 - toNum(data.real_estate_loan_balance)))
  const reStartRow = r
  r++

  // Extra blank row for second property
  inputCell(ws, r, 1, null)
  inputCell(ws, r, 2, null, CURRENCY_FMT)
  formulaCell(ws, r, 3, `B${r}*0.8`, 0)
  inputCell(ws, r, 4, null, CURRENCY_FMT)
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, 0)
  r++

  const reEndRow = r - 1
  labelCell(ws, r, 1, "TOTAL REAL ESTATE", true)
  formulaCell(ws, r, 2, `SUM(B${reStartRow}:B${reEndRow})`, toNum(data.real_estate_fmv))
  formulaCell(ws, r, 3, `SUM(C${reStartRow}:C${reEndRow})`, toNum(data.real_estate_fmv) * 0.8)
  formulaCell(ws, r, 4, `SUM(D${reStartRow}:D${reEndRow})`, toNum(data.real_estate_loan_balance))
  formulaCell(ws, r, 5, `SUM(E${reStartRow}:E${reEndRow})`, Math.max(0, toNum(data.real_estate_fmv) * 0.8 - toNum(data.real_estate_loan_balance)))
  const reEquityRow = r
  r++

  // ─── VEHICLES ───
  r++
  sectionHeader(ws, r, "VEHICLES", 6)
  r++
  colHeaderRow(ws, r, ["Vehicle", "FMV", "QSV (80%)", "Loan Balance", "Net Equity", "Notes"])
  r++

  const vehDesc = data.vehicles || "Vehicle 1"
  inputCell(ws, r, 1, vehDesc)
  inputCell(ws, r, 2, toNum(data.vehicles_fmv) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 3, `B${r}*0.8`, toNum(data.vehicles_fmv) * 0.8)
  inputCell(ws, r, 4, toNum(data.vehicles_loan_balance) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, Math.max(0, toNum(data.vehicles_fmv) * 0.8 - toNum(data.vehicles_loan_balance)))
  const vehStartRow = r
  r++

  // Extra blank row for second vehicle
  inputCell(ws, r, 1, null)
  inputCell(ws, r, 2, null, CURRENCY_FMT)
  formulaCell(ws, r, 3, `B${r}*0.8`, 0)
  inputCell(ws, r, 4, null, CURRENCY_FMT)
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, 0)
  r++

  const vehEndRow = r - 1
  labelCell(ws, r, 1, "TOTAL VEHICLES", true)
  formulaCell(ws, r, 2, `SUM(B${vehStartRow}:B${vehEndRow})`, toNum(data.vehicles_fmv))
  formulaCell(ws, r, 3, `SUM(C${vehStartRow}:C${vehEndRow})`, toNum(data.vehicles_fmv) * 0.8)
  formulaCell(ws, r, 4, `SUM(D${vehStartRow}:D${vehEndRow})`, toNum(data.vehicles_loan_balance))
  formulaCell(ws, r, 5, `SUM(E${vehStartRow}:E${vehEndRow})`, Math.max(0, toNum(data.vehicles_fmv) * 0.8 - toNum(data.vehicles_loan_balance)))
  const vehEquityRow = r
  r++

  // ─── RETIREMENT ───
  r++
  sectionHeader(ws, r, "RETIREMENT ACCOUNTS", 6)
  r++

  labelCell(ws, r, 1, "Assumed Tax Rate")
  inputCell(ws, r, 2, 0.24, PERCENT_FMT)
  noteCell(ws, r, 3, "Change to match taxpayer's marginal rate")
  const taxRateRow = r
  r++

  colHeaderRow(ws, r, ["Account", "Balance", "Early WD Penalty (10%)", "Est. Tax", "Net Value", "Notes"])
  r++

  const retAccounts = data.retirement_accounts || []
  const retStartRow = r
  if (Array.isArray(retAccounts) && retAccounts.length > 0) {
    for (const acct of retAccounts) {
      inputCell(ws, r, 1, `${acct.type || ""} - ${acct.custodian || ""}`)
      inputCell(ws, r, 2, toNum(acct.balance), CURRENCY_FMT)
      formulaCell(ws, r, 3, `B${r}*0.1`, toNum(acct.balance) * 0.1)
      formulaCell(ws, r, 4, `B${r}*$B$${taxRateRow}`, toNum(acct.balance) * 0.24)
      formulaCell(ws, r, 5, `B${r}-C${r}-D${r}`, toNum(acct.balance) * (1 - 0.1 - 0.24))
      r++
    }
  } else {
    for (let i = 0; i < 2; i++) {
      inputCell(ws, r, 1, null)
      inputCell(ws, r, 2, null, CURRENCY_FMT)
      formulaCell(ws, r, 3, `B${r}*0.1`, 0)
      formulaCell(ws, r, 4, `B${r}*$B$${taxRateRow}`, 0)
      formulaCell(ws, r, 5, `B${r}-C${r}-D${r}`, 0)
      r++
    }
  }
  const retEndRow = r - 1

  labelCell(ws, r, 1, "TOTAL RETIREMENT", true)
  formulaCell(ws, r, 2, `SUM(B${retStartRow}:B${retEndRow})`,
    Array.isArray(retAccounts) ? retAccounts.reduce((s: number, a: any) => s + toNum(a.balance), 0) : toNum(data.total_retirement_balance))
  formulaCell(ws, r, 3, `SUM(C${retStartRow}:C${retEndRow})`, 0)
  formulaCell(ws, r, 4, `SUM(D${retStartRow}:D${retEndRow})`, 0)
  formulaCell(ws, r, 5, `SUM(E${retStartRow}:E${retEndRow})`, 0)
  const retEquityRow = r
  r++

  // ─── OTHER ASSETS ───
  r++
  sectionHeader(ws, r, "OTHER PERSONAL ASSETS", 6)
  r++
  colHeaderRow(ws, r, ["Item", "Value", "", "", "", ""])
  r++

  const otherFields: [string, string][] = [
    ["Investment Accounts", "investment_accounts"],
    ["Life Insurance Cash Value", "life_insurance_cash_value"],
    ["Digital Assets (crypto, etc.)", "digital_assets"],
    ["Other Assets", "other_personal_assets"],
  ]
  const otherStartRow = r
  for (const [label, key] of otherFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, toNum(data[key]) || null, CURRENCY_FMT)
    r++
  }
  const otherEndRow = r - 1

  labelCell(ws, r, 1, "Life Insurance Loan Balance")
  inputCell(ws, r, 2, toNum(data.life_insurance_loan_balance) || null, CURRENCY_FMT)
  const liLoanRow = r
  r++

  labelCell(ws, r, 1, "TOTAL OTHER ASSETS", true)
  formulaCell(ws, r, 2, `SUM(B${otherStartRow}:B${otherEndRow})-B${liLoanRow}`,
    toNum(data.investment_accounts) + toNum(data.life_insurance_cash_value) +
    toNum(data.digital_assets) + toNum(data.other_personal_assets) - toNum(data.life_insurance_loan_balance))
  const otherTotalRow = r
  r++

  // ─── TOTAL PERSONAL EQUITY ───
  r++
  sectionHeader(ws, r, "TOTAL NET PERSONAL ASSET EQUITY", 6)
  r++
  labelCell(ws, r, 1, "Cash on Hand", true)
  formulaCell(ws, r, 2, `C${cashRow}`, toNum(data.cash_on_hand))
  r++
  labelCell(ws, r, 1, "Bank Accounts", true)
  formulaCell(ws, r, 2, `C${bankTotalRow}`, toNum(data.total_bank_balances))
  r++
  labelCell(ws, r, 1, "Real Estate Net Equity", true)
  formulaCell(ws, r, 2, `E${reEquityRow}`, Math.max(0, toNum(data.real_estate_fmv) * 0.8 - toNum(data.real_estate_loan_balance)))
  r++
  labelCell(ws, r, 1, "Vehicle Net Equity", true)
  formulaCell(ws, r, 2, `E${vehEquityRow}`, Math.max(0, toNum(data.vehicles_fmv) * 0.8 - toNum(data.vehicles_loan_balance)))
  r++
  labelCell(ws, r, 1, "Retirement (Net of Penalties & Tax)", true)
  formulaCell(ws, r, 2, `E${retEquityRow}`, 0)
  r++
  labelCell(ws, r, 1, "Other Assets (net)", true)
  formulaCell(ws, r, 2, `B${otherTotalRow}`, 0)
  const summStartRow = r - 5
  const summEndRow = r
  r++

  r++
  labelCell(ws, r, 1, "TOTAL NET PERSONAL ASSET EQUITY", true)
  formulaCell(ws, r, 2, `SUM(B${summStartRow}:B${summEndRow})`, 0)
  const equityRow = r

  wb.definedNames.add(`'Personal Assets'!$B$${equityRow}`, "PERSONAL_EQUITY")

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
  return { equityRow }
}

function buildBusinessInfo(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
) {
  const ws = wb.addWorksheet("Business Info")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 35
  ws.getColumn(2).width = 40
  ws.getColumn(3).width = 25

  let r = 1
  sectionHeader(ws, r, "BUSINESS DETAILS", 3)
  r++
  const fields: [string, string][] = [
    ["Business Name", "biz_name"],
    ["EIN", "biz_ein"],
    ["Entity Type", "biz_entity_type"],
    ["Return Type Filed", "biz_return_type"],
    ["Business Address", "biz_address"],
    ["Date Started", "biz_start_date"],
    ["Officers/Partners", "biz_officers"],
  ]
  for (const [label, key] of fields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, data[key] || "")
    r++
  }

  r++
  sectionHeader(ws, r, "BUSINESS RECEIVABLES", 3)
  r++
  labelCell(ws, r, 1, "Accounts Receivable")
  inputCell(ws, r, 2, toNum(data.biz_accounts_receivable) || null, CURRENCY_FMT)
  r++
  labelCell(ws, r, 1, "Notes Receivable")
  inputCell(ws, r, 2, toNum(data.biz_notes_receivable) || null, CURRENCY_FMT)
  r++

  r++
  sectionHeader(ws, r, "FORM 433-B QUESTIONNAIRE", 3)
  r++
  const qFields: [string, string, string?][] = [
    ["Business filed bankruptcy?", "biz_q_bankruptcy"],
    ["Related businesses/affiliations?", "biz_q_affiliations"],
    ["Debts owed to related parties?", "biz_q_related_party_debts"],
    ["Pending litigation?", "biz_q_litigation"],
    ["Asset transfers in last 10 years?", "biz_q_asset_transfers", "PRACTITIONER_JUDGMENT"],
    ["Foreign operations or accounts?", "biz_q_foreign_operations"],
    ["Third-party funds held?", "biz_q_third_party_funds"],
    ["Lines of credit available?", "biz_q_lines_of_credit"],
  ]
  for (const [label, key, flag] of qFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, data[key] || "", undefined, flag)
    if (flag) noteCell(ws, r, 3, `[${flag.replace("_", " ")}]`)
    r++
  }

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
}

function buildBusinessIE(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
) {
  const ws = wb.addWorksheet("Business I&E")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 35
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 25

  let r = 1
  sectionHeader(ws, r, "MONTHLY BUSINESS INCOME", 3)
  r++
  colHeaderRow(ws, r, ["Description", "Monthly Amount", "Notes"])
  r++

  const incomeFields: [string, string][] = [
    ["Gross Receipts/Sales", "biz_gross_receipts"],
    ["Rental Income", "biz_rental_income"],
    ["Interest Income", "biz_interest_income"],
    ["Dividend Income", "biz_dividend_income"],
    ["Other Business Income", "biz_other_income"],
  ]
  const bizIncStart = r
  for (const [label, key] of incomeFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, toNum(data[key]) || null, CURRENCY_FMT)
    r++
  }
  const bizIncEnd = r - 1

  labelCell(ws, r, 1, "TOTAL BUSINESS INCOME", true)
  formulaCell(ws, r, 2, `SUM(B${bizIncStart}:B${bizIncEnd})`,
    incomeFields.reduce((s, [, key]) => s + toNum(data[key]), 0))
  const bizIncTotalRow = r
  r++

  r++
  sectionHeader(ws, r, "MONTHLY BUSINESS EXPENSES", 3)
  r++
  colHeaderRow(ws, r, ["Description", "Monthly Amount", "Notes"])
  r++

  const expFields: [string, string][] = [
    ["Materials/Inventory", "biz_expense_materials"],
    ["Wages/Salaries", "biz_expense_wages"],
    ["Rent", "biz_expense_rent"],
    ["Supplies", "biz_expense_supplies"],
    ["Utilities/Telephone", "biz_expense_utilities"],
    ["Vehicle Costs", "biz_expense_vehicle"],
    ["Insurance", "biz_expense_insurance"],
    ["Current Taxes", "biz_expense_taxes"],
    ["Other Expenses", "biz_expense_other"],
  ]
  const bizExpStart = r
  for (const [label, key] of expFields) {
    labelCell(ws, r, 1, label)
    inputCell(ws, r, 2, toNum(data[key]) || null, CURRENCY_FMT)
    r++
  }
  const bizExpEnd = r - 1

  labelCell(ws, r, 1, "Other Expenses Detail")
  inputCell(ws, r, 2, data.biz_expense_other_detail || "")
  r++

  labelCell(ws, r, 1, "TOTAL BUSINESS EXPENSES", true)
  formulaCell(ws, r, 2, `SUM(B${bizExpStart}:B${bizExpEnd})`,
    expFields.reduce((s, [, key]) => s + toNum(data[key]), 0))
  const bizExpTotalRow = r
  r++

  r++
  labelCell(ws, r, 1, "NET BUSINESS INCOME", true)
  formulaCell(ws, r, 2, `B${bizIncTotalRow}-B${bizExpTotalRow}`,
    incomeFields.reduce((s, [, key]) => s + toNum(data[key]), 0) -
    expFields.reduce((s, [, key]) => s + toNum(data[key]), 0))

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
}

function buildBusinessAssets(
  wb: ExcelJS.Workbook, data: ExtractedData, tabsNumber: string
): { equityRow: number } {
  const ws = wb.addWorksheet("Business Assets")
  styleSheet(ws, tabsNumber)
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18
  ws.getColumn(5).width = 18
  ws.getColumn(6).width = 25

  let r = 1

  // ─── CASH ───
  sectionHeader(ws, r, "BUSINESS CASH & ACCOUNTS", 6)
  r++
  labelCell(ws, r, 1, "Cash on Hand")
  inputCell(ws, r, 2, toNum(data.biz_cash_on_hand) || null, CURRENCY_FMT)
  const bizCashRow = r
  r++
  labelCell(ws, r, 1, "Total Bank Balances")
  inputCell(ws, r, 2, toNum(data.biz_total_bank_balances) || null, CURRENCY_FMT)
  const bizBankRow = r
  r++
  labelCell(ws, r, 1, "Accounts Receivable")
  inputCell(ws, r, 2, toNum(data.biz_accounts_receivable_total) || null, CURRENCY_FMT)
  const bizARRow = r
  r++

  // ─── EQUIPMENT ───
  r++
  sectionHeader(ws, r, "BUSINESS EQUIPMENT", 6)
  r++
  colHeaderRow(ws, r, ["Description", "FMV", "QSV (80%)", "Loan Balance", "Net Equity", "Notes"])
  r++
  inputCell(ws, r, 1, data.biz_equipment || "")
  inputCell(ws, r, 2, toNum(data.biz_equipment_fmv) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 3, `B${r}*0.8`, toNum(data.biz_equipment_fmv) * 0.8)
  inputCell(ws, r, 4, toNum(data.biz_equipment_loan_balance) || null, CURRENCY_FMT)
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, Math.max(0, toNum(data.biz_equipment_fmv) * 0.8 - toNum(data.biz_equipment_loan_balance)))
  const equipRow = r
  r++

  // ─── BUSINESS VEHICLES ───
  r++
  sectionHeader(ws, r, "BUSINESS VEHICLES", 6)
  r++
  colHeaderRow(ws, r, ["Vehicle", "FMV", "QSV (80%)", "Loan Balance", "Net Equity", "Notes"])
  r++
  inputCell(ws, r, 1, data.biz_vehicles || "")
  inputCell(ws, r, 2, toNum(data.biz_vehicles_fmv) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 3, `B${r}*0.8`, toNum(data.biz_vehicles_fmv) * 0.8)
  inputCell(ws, r, 4, toNum(data.biz_vehicles_loan_balance) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, Math.max(0, toNum(data.biz_vehicles_fmv) * 0.8 - toNum(data.biz_vehicles_loan_balance)))
  const bizVehRow = r
  r++

  // ─── BUSINESS REAL ESTATE ───
  r++
  sectionHeader(ws, r, "BUSINESS REAL ESTATE", 6)
  r++
  colHeaderRow(ws, r, ["Property", "FMV", "QSV (80%)", "Loan Balance", "Net Equity", "Notes"])
  r++
  inputCell(ws, r, 1, data.biz_real_estate || "")
  inputCell(ws, r, 2, toNum(data.biz_real_estate_fmv) || null, CURRENCY_FMT, "VERIFY")
  formulaCell(ws, r, 3, `B${r}*0.8`, toNum(data.biz_real_estate_fmv) * 0.8)
  inputCell(ws, r, 4, toNum(data.biz_real_estate_loan) || null, CURRENCY_FMT)
  formulaCell(ws, r, 5, `MAX(C${r}-D${r},0)`, Math.max(0, toNum(data.biz_real_estate_fmv) * 0.8 - toNum(data.biz_real_estate_loan)))
  const bizRERow = r
  r++

  // ─── OTHER ───
  r++
  sectionHeader(ws, r, "OTHER BUSINESS ASSETS", 6)
  r++
  labelCell(ws, r, 1, "Intangible Assets / Goodwill")
  inputCell(ws, r, 2, toNum(data.biz_intangibles) || null, CURRENCY_FMT, "PRACTITIONER_JUDGMENT")
  noteCell(ws, r, 3, "[PRACTITIONER JUDGMENT]")
  const intRow = r
  r++
  labelCell(ws, r, 1, "Available Lines of Credit")
  inputCell(ws, r, 2, toNum(data.biz_lines_of_credit) || null, CURRENCY_FMT)
  const locRow = r
  r++
  labelCell(ws, r, 1, "Other Business Assets")
  inputCell(ws, r, 2, toNum(data.biz_other_assets) || null, CURRENCY_FMT)
  const otherBizRow = r
  r++

  // ─── TOTAL ───
  r++
  sectionHeader(ws, r, "TOTAL NET BUSINESS ASSET EQUITY", 6)
  r++

  const components: [string, string][] = [
    ["Cash on Hand", `B${bizCashRow}`],
    ["Bank Balances", `B${bizBankRow}`],
    ["Accounts Receivable", `B${bizARRow}`],
    ["Equipment Net Equity", `E${equipRow}`],
    ["Vehicle Net Equity", `E${bizVehRow}`],
    ["Real Estate Net Equity", `E${bizRERow}`],
    ["Intangibles", `B${intRow}`],
    ["Other Assets", `B${otherBizRow}`],
  ]
  const compStartRow = r
  for (const [label, ref] of components) {
    labelCell(ws, r, 1, label, true)
    formulaCell(ws, r, 2, ref, 0)
    r++
  }
  const compEndRow = r - 1
  r++

  labelCell(ws, r, 1, "TOTAL NET BUSINESS ASSET EQUITY", true)
  formulaCell(ws, r, 2, `SUM(B${compStartRow}:B${compEndRow})`, 0)
  const equityRow = r

  wb.definedNames.add(`'Business Assets'!$B$${equityRow}`, "BUSINESS_EQUITY")

  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true })
  return { equityRow }
}

// ─── Main Export ─────────────────────────────────────────────────

export async function generateOICWorkingPapersExcel(
  extracted: ExtractedData,
  merged: MergeResult,
  tabsNumber: string,
  clientName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "CLEARED Tax Resolution Platform"
  wb.created = new Date()

  // Build all sheets in order
  buildCover(wb, tabsNumber, clientName)

  const summaryRefs = buildSummary(wb, extracted, merged.summary, tabsNumber)

  const { totalRow: liabTotalRow } = buildLiability(wb, extracted, tabsNumber)

  buildTPInfo(wb, extracted, tabsNumber)

  const { netRow: ieNetRow } = buildPersonalIE(wb, extracted, merged.summary, tabsNumber)

  const { equityRow: personalEquityRow } = buildPersonalAssets(wb, extracted, tabsNumber)

  buildBusinessInfo(wb, extracted, tabsNumber)
  buildBusinessIE(wb, extracted, tabsNumber)

  const { equityRow: businessEquityRow } = buildBusinessAssets(wb, extracted, tabsNumber)

  // ─── Fix cross-sheet references on Summary ───
  // Now that all sheets exist, update the Summary formulas
  const ws = summaryRefs.ws

  // Total tax liability → Liability sheet total
  ws.getCell(summaryRefs.personalEquityRow - 3, 2).value = {
    formula: `'Liability'!F${liabTotalRow}`,
    result: merged.summary.totalLiability,
  }

  // Personal asset equity → Personal Assets total
  ws.getCell(summaryRefs.personalEquityRow, 2).value = {
    formula: "PERSONAL_EQUITY",
    result: merged.summary.totalAssetEquity, // will be recomputed
  }

  // Business asset equity → Business Assets total
  ws.getCell(summaryRefs.businessEquityRow, 2).value = {
    formula: "BUSINESS_EQUITY",
    result: 0,
  }

  // Monthly disposable income → Personal I&E net
  ws.getCell(summaryRefs.monthlyIncomeRow, 2).value = {
    formula: "IE_NET",
    result: merged.summary.monthlyNetIncome,
  }

  // Apply cell formatting to the updated cells
  for (const row of [summaryRefs.personalEquityRow - 3, summaryRefs.personalEquityRow, summaryRefs.businessEquityRow, summaryRefs.monthlyIncomeRow]) {
    const cell = ws.getCell(row, 2)
    cell.font = { name: FONT, size: 10, bold: true }
    cell.numFmt = CURRENCY_FMT
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FORMULA_BG } }
    cell.border = allBorders
    cell.protection = { locked: true }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
