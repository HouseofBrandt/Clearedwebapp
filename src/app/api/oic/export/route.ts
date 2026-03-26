export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import ExcelJS from "exceljs"

/**
 * POST /api/oic/export
 *
 * Generates a 433-A Worksheet .xlsx file from OIC modeler data.
 * Sheets: Income, Expenses, Assets, RCP Summary.
 * Font: Times New Roman throughout per document export standard.
 */

interface ExportPayload {
  income: {
    wages: number
    selfEmployment: number
    socialSecurity: number
    pension: number
    rentalIncome: number
    otherIncome: number
  }
  expenses: {
    housing: number
    utilities: number
    transportation: number
    healthInsurance: number
    courtOrderedPayments: number
    childcare: number
    otherExpenses: number
  }
  irsStandards?: {
    housing?: number
    utilities?: number
    transportation?: number
    healthInsurance?: number
    foodClothing?: number
  }
  assets: {
    bankAccounts: number
    investments: number
    retirement: number
    realEstate: Array<{ description?: string; fmv: number; loan: number }>
    vehicles: Array<{ description?: string; fmv: number; loan: number }>
    otherAssets: number
    lifeInsurance: number
  }
  householdConfig: {
    householdSize: number
    membersOver65: number
    housingTier: string
    numberOfCars: number
    totalLiability: number
  }
  rcp: {
    monthlyIncome: number
    allowableExpenses: number
    monthlyDisposable: number
    futureIncomeLumpSum: number
    futureIncomePeriodic: number
    assetEquity: number
    rcpLumpSum: number
    rcpPeriodic: number
  }
  options?: {
    excludeRetirement?: boolean
    challengeVehicleEquity?: boolean
  }
}

// ── Style constants ─────────────────────────────────────────

const FONT_NAME = "Times New Roman"

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  bold: true,
  size: 11,
  color: { argb: "FFFFFFFF" },
}

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F3864" }, // navy
}

const BODY_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 11,
}

const LABEL_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 11,
  bold: true,
}

const CURRENCY_FORMAT = '$#,##0.00'

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
}

// ── Helpers ─────────────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1)
  row.eachCell((cell) => {
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.border = THIN_BORDER
    cell.alignment = { vertical: "middle" }
  })
  row.height = 22
}

function addDataRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: number,
  extra?: string
) {
  const rowValues: (string | number)[] = [label, value]
  if (extra !== undefined) rowValues.push(extra)
  const row = sheet.addRow(rowValues)
  row.eachCell((cell, colNumber) => {
    cell.font = colNumber === 1 ? LABEL_FONT : BODY_FONT
    cell.border = THIN_BORDER
    if (colNumber === 2) {
      cell.numFmt = CURRENCY_FORMAT
    }
    cell.alignment = { vertical: "middle" }
  })
}

function addTotalRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: number
) {
  const row = sheet.addRow([label, value])
  row.eachCell((cell, colNumber) => {
    cell.font = { ...LABEL_FONT, bold: true }
    cell.border = {
      top: { style: "double" },
      left: { style: "thin" },
      bottom: { style: "double" },
      right: { style: "thin" },
    }
    if (colNumber === 2) {
      cell.numFmt = CURRENCY_FORMAT
    }
    cell.alignment = { vertical: "middle" }
  })
  row.height = 22
}

// ── Route handler ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const payload: ExportPayload = await request.json()
    const { income, expenses, assets, rcp, householdConfig, options } = payload

    const workbook = new ExcelJS.Workbook()
    workbook.creator = "Cleared Platform"
    workbook.created = new Date()

    // ── Sheet 1: Income ───────────────────────────────────────
    const incomeSheet = workbook.addWorksheet("Income")
    incomeSheet.columns = [
      { header: "Income Source", key: "label", width: 30 },
      { header: "Monthly Amount", key: "amount", width: 20 },
      { header: "Notes", key: "notes", width: 30 },
    ]
    styleHeaderRow(incomeSheet)

    const incomeItems = [
      { label: "Wages / Salary", value: income.wages, notes: "Form 433-A, Line 24" },
      { label: "Self-Employment Income", value: income.selfEmployment, notes: "Form 433-A, Line 25" },
      { label: "Social Security", value: income.socialSecurity, notes: "" },
      { label: "Pension / Annuity", value: income.pension, notes: "" },
      { label: "Rental Income", value: income.rentalIncome, notes: "" },
      { label: "Other Income", value: income.otherIncome, notes: "" },
    ]

    for (const item of incomeItems) {
      addDataRow(incomeSheet, item.label, item.value, item.notes)
    }

    addTotalRow(incomeSheet, "Total Monthly Income", rcp.monthlyIncome)

    // ── Sheet 2: Expenses ─────────────────────────────────────
    const expenseSheet = workbook.addWorksheet("Expenses")
    expenseSheet.columns = [
      { header: "Expense Category", key: "label", width: 30 },
      { header: "Actual / Claimed", key: "amount", width: 20 },
      { header: "IRS Allowable", key: "irsAllowable", width: 20 },
      { header: "Notes", key: "notes", width: 30 },
    ]
    styleHeaderRow(expenseSheet)

    const std = payload.irsStandards || {}

    const expenseItems = [
      { label: "Housing", value: expenses.housing, irs: std.housing, notes: "Local Standard" },
      { label: "Utilities", value: expenses.utilities, irs: std.utilities, notes: "Local Standard" },
      { label: "Transportation", value: expenses.transportation, irs: std.transportation, notes: "Local Standard" },
      { label: "Health Insurance", value: expenses.healthInsurance, irs: std.healthInsurance, notes: "National Standard" },
      { label: "Court-Ordered Payments", value: expenses.courtOrderedPayments, irs: undefined, notes: "Actual" },
      { label: "Childcare / Dependent Care", value: expenses.childcare, irs: undefined, notes: "Actual" },
      { label: "Other Expenses", value: expenses.otherExpenses, irs: undefined, notes: "" },
    ]

    for (const item of expenseItems) {
      const row = expenseSheet.addRow([
        item.label,
        item.value,
        item.irs ?? "",
        item.notes,
      ])
      row.eachCell((cell, colNumber) => {
        cell.font = colNumber === 1 ? LABEL_FONT : BODY_FONT
        cell.border = THIN_BORDER
        if (colNumber === 2 || colNumber === 3) {
          cell.numFmt = CURRENCY_FORMAT
        }
        cell.alignment = { vertical: "middle" }
      })
    }

    addTotalRow(expenseSheet, "Total Allowable Expenses", rcp.allowableExpenses)

    // ── Sheet 3: Assets ───────────────────────────────────────
    const assetSheet = workbook.addWorksheet("Assets")
    assetSheet.columns = [
      { header: "Asset", key: "label", width: 30 },
      { header: "FMV", key: "fmv", width: 18 },
      { header: "Loan / Encumbrance", key: "loan", width: 20 },
      { header: "Equity (QSV)", key: "equity", width: 18 },
      { header: "Notes", key: "notes", width: 30 },
    ]
    styleHeaderRow(assetSheet)

    const addAssetRow = (
      label: string,
      fmv: number,
      loan: number,
      equity: number,
      notes: string
    ) => {
      const row = assetSheet.addRow([label, fmv, loan, equity, notes])
      row.eachCell((cell, colNumber) => {
        cell.font = colNumber === 1 ? LABEL_FONT : BODY_FONT
        cell.border = THIN_BORDER
        if (colNumber >= 2 && colNumber <= 4) {
          cell.numFmt = CURRENCY_FORMAT
        }
        cell.alignment = { vertical: "middle" }
      })
    }

    const QSV = 0.80
    const vehicleQSV = options?.challengeVehicleEquity ? 0.60 : 0.80

    addAssetRow("Bank Accounts", assets.bankAccounts, 0, assets.bankAccounts, "Full value (no QSV)")
    addAssetRow("Investments", assets.investments, 0, Math.round(assets.investments * QSV * 100) / 100, `${QSV * 100}% QSV`)
    addAssetRow(
      "Retirement Accounts",
      assets.retirement,
      0,
      options?.excludeRetirement ? 0 : Math.round(assets.retirement * QSV * 100) / 100,
      options?.excludeRetirement ? "Excluded" : `${QSV * 100}% QSV`
    )

    for (let i = 0; i < assets.realEstate.length; i++) {
      const re = assets.realEstate[i]
      const qsv = Math.round(re.fmv * QSV * 100) / 100
      const equity = Math.max(0, qsv - re.loan)
      addAssetRow(
        re.description || `Real Estate #${i + 1}`,
        re.fmv,
        re.loan,
        equity,
        `${QSV * 100}% QSV`
      )
    }

    for (let i = 0; i < assets.vehicles.length; i++) {
      const v = assets.vehicles[i]
      const qsv = Math.round(v.fmv * vehicleQSV * 100) / 100
      const equity = Math.max(0, qsv - v.loan)
      addAssetRow(
        v.description || `Vehicle #${i + 1}`,
        v.fmv,
        v.loan,
        equity,
        options?.challengeVehicleEquity ? `${vehicleQSV * 100}% QSV (challenged)` : `${vehicleQSV * 100}% QSV`
      )
    }

    addAssetRow("Other Assets", assets.otherAssets, 0, Math.round(assets.otherAssets * QSV * 100) / 100, `${QSV * 100}% QSV`)
    addAssetRow("Life Insurance (CSV)", assets.lifeInsurance, 0, assets.lifeInsurance, "Cash surrender value")

    addTotalRow(assetSheet, "Total Asset Equity", rcp.assetEquity)

    // ── Sheet 4: RCP Summary ──────────────────────────────────
    const rcpSheet = workbook.addWorksheet("RCP Summary")
    rcpSheet.columns = [
      { header: "Component", key: "label", width: 35 },
      { header: "Lump Sum (12 mo)", key: "lumpSum", width: 22 },
      { header: "Periodic (24 mo)", key: "periodic", width: 22 },
    ]
    styleHeaderRow(rcpSheet)

    const addRcpRow = (label: string, lump: number, periodic: number, isBold = false) => {
      const row = rcpSheet.addRow([label, lump, periodic])
      row.eachCell((cell, colNumber) => {
        cell.font = isBold
          ? { ...LABEL_FONT, bold: true }
          : colNumber === 1 ? LABEL_FONT : BODY_FONT
        cell.border = THIN_BORDER
        if (colNumber >= 2) {
          cell.numFmt = CURRENCY_FORMAT
        }
        cell.alignment = { vertical: "middle" }
      })
    }

    addRcpRow("Monthly Income", rcp.monthlyIncome, rcp.monthlyIncome)
    addRcpRow("Allowable Expenses", -rcp.allowableExpenses, -rcp.allowableExpenses)
    addRcpRow("Monthly Disposable Income", rcp.monthlyDisposable, rcp.monthlyDisposable)

    // Spacer row
    const spacer = rcpSheet.addRow(["", "", ""])
    spacer.eachCell((cell) => { cell.border = THIN_BORDER })

    addRcpRow("Future Income Component", rcp.futureIncomeLumpSum, rcp.futureIncomePeriodic)
    addRcpRow("Net Equity in Assets", rcp.assetEquity, rcp.assetEquity)

    // Total RCP
    const totalRow = rcpSheet.addRow(["REASONABLE COLLECTION POTENTIAL", rcp.rcpLumpSum, rcp.rcpPeriodic])
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { ...LABEL_FONT, bold: true, size: 12 }
      cell.border = {
        top: { style: "double" },
        left: { style: "thin" },
        bottom: { style: "double" },
        right: { style: "thin" },
      }
      if (colNumber >= 2) {
        cell.numFmt = CURRENCY_FORMAT
      }
      cell.alignment = { vertical: "middle" }
    })
    totalRow.height = 24

    // Liability comparison
    rcpSheet.addRow([])
    addRcpRow("Total Tax Liability", householdConfig.totalLiability, householdConfig.totalLiability)
    addRcpRow(
      "Potential Savings",
      householdConfig.totalLiability - rcp.rcpLumpSum,
      householdConfig.totalLiability - rcp.rcpPeriodic
    )

    // Household info row
    rcpSheet.addRow([])
    const infoRow = rcpSheet.addRow([
      `Household: ${householdConfig.householdSize} person(s), ${householdConfig.numberOfCars} vehicle(s), ${householdConfig.housingTier} cost area`,
      "",
      "",
    ])
    infoRow.eachCell((cell) => {
      cell.font = { name: FONT_NAME, size: 9, italic: true }
    })

    // ── Generate buffer and return ────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="433-A_Worksheet_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error("OIC export error:", error)
    return NextResponse.json(
      { error: `Failed to generate worksheet: ${error.message}` },
      { status: 500 }
    )
  }
}
