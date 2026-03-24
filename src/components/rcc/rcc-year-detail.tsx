"use client"

import type { ReturnEstimate } from "@/lib/tax/engine"
import { TC_CODES } from "@/lib/tax/engine"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtD = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

interface RCCYearDetailProps {
  selectedYear: string | null
  years: string[]
  rawYears: Record<string, any>
  getYearIncome: (yr: string) => any
  getYearOverrides: (yr: string) => any
  getYearResults: (yr: string) => ReturnEstimate
  updateOverride: (yr: string, key: string, val: any) => void
  onSelectYear: (yr: string) => void
}

export function RCCYearDetail({
  selectedYear,
  years,
  rawYears,
  getYearIncome,
  getYearOverrides,
  getYearResults,
  updateOverride,
  onSelectYear,
}: RCCYearDetailProps) {
  const yr = selectedYear
  if (!yr || !rawYears[yr]) {
    return (
      <div className="text-center py-16 text-slate-400">
        Select a year from the Dashboard to view details.
      </div>
    )
  }

  const yd = rawYears[yr]
  const income = getYearIncome(yr)
  const ov = getYearOverrides(yr)
  const res = getYearResults(yr)
  const forms = yd?.wage_income?.forms || []

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tax Year {yr}</h2>
          <p className="text-xs text-slate-400 mt-1">Return Estimator & Transcript Detail</p>
        </div>
        <div className="flex gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => onSelectYear(y)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold border transition-colors ${
                y === yr
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900"
                  : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* LEFT: Transcript Data */}
        <div className="space-y-4">
          {/* Income Sources */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/30">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              Income Sources (W&I Transcript)
            </div>
            {forms.length === 0 && (
              <div className="text-xs text-slate-400 italic">No wage & income data available</div>
            )}
            {forms.map((f: any, i: number) => (
              <div
                key={i}
                className="mb-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {f.type} \u2014 {f.payer}
                </div>
                {f.ein && <div className="text-[10px] text-slate-400 mb-2">EIN: {f.ein}</div>}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {Object.entries(f.fields || {})
                    .filter(([, v]) => v && v !== 0 && typeof v !== "object")
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {typeof v === "number" ? fmtD(v) : String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Account Transcript */}
          {yd?.account && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/30">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Account Transcript
              </div>
              <div className="flex gap-4 mb-3 text-xs">
                <div>
                  <span className="text-slate-400">Balance: </span>
                  <strong className="text-slate-700 dark:text-slate-300">{fmt(yd.account.balance || 0)}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Interest: </span>
                  <strong className="text-slate-700 dark:text-slate-300">{fmt(yd.account.accrued_interest || 0)}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Penalty: </span>
                  <strong className="text-slate-700 dark:text-slate-300">{fmt(yd.account.accrued_penalty || 0)}</strong>
                </div>
              </div>
              {(yd.account.transactions || []).length > 0 && (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      {["Code", "Description", "Date", "Amount"].map((h) => (
                        <th
                          key={h}
                          className={`py-1 px-1.5 text-slate-400 font-semibold ${h === "Amount" ? "text-right" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(yd.account.transactions || []).map((t: any, j: number) => {
                      const isCritical = ["540", "590", "582"].includes(t.code)
                      return (
                        <tr
                          key={j}
                          className={`border-b border-slate-100 dark:border-slate-800 ${isCritical ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                        >
                          <td className={`py-1 px-1.5 font-mono font-bold ${isCritical ? "text-red-600" : "text-slate-700 dark:text-slate-300"}`}>
                            {t.code || "\u2014"}
                          </td>
                          <td className="py-1 px-1.5 text-slate-500">{t.description || TC_CODES[t.code] || "\u2014"}</td>
                          <td className="py-1 px-1.5 font-mono text-slate-400">{t.date || "\u2014"}</td>
                          <td
                            className={`py-1 px-1.5 text-right font-mono ${
                              t.amount < 0 ? "text-green-600" : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {t.amount != null ? fmtD(t.amount) : "\u2014"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Return Estimator */}
        <div>
          <div className="border-2 border-slate-900 dark:border-slate-100 rounded-lg p-4 mb-4">
            <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3">
              Return Estimator \u2014 TY {yr}
            </div>

            {/* Overrides */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <label className="text-[11px] text-slate-400">
                Filing Status
                <select
                  value={ov.filingStatus}
                  onChange={(e) => updateOverride(yr, "filingStatus", e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900"
                >
                  <option value="single">Single</option>
                  <option value="mfj">MFJ</option>
                  <option value="mfs">MFS</option>
                  <option value="hoh">HoH</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">
                {"Add'l Income (manual)"}
                <input
                  type="number"
                  value={ov.additionalIncome || ""}
                  onChange={(e) => updateOverride(yr, "additionalIncome", parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono bg-white dark:bg-slate-900"
                  placeholder="0"
                />
              </label>
              <label className="text-[11px] text-slate-400">
                Itemized Deductions
                <input
                  type="number"
                  value={ov.itemizedAmount || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    updateOverride(yr, "itemizedAmount", val)
                    updateOverride(yr, "useItemized", val > 0)
                  }}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono bg-white dark:bg-slate-900"
                  placeholder="0 = use standard"
                />
              </label>
              <label className="text-[11px] text-slate-400">
                Credits
                <input
                  type="number"
                  value={ov.credits || ""}
                  onChange={(e) => updateOverride(yr, "credits", parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono bg-white dark:bg-slate-900"
                  placeholder="0"
                />
              </label>
            </div>

            {/* Computation lines */}
            <div className="text-xs space-y-0">
              <Line label="Net Social Security Benefits" value={fmt(res.netSS)} bold />
              <Line label="Provisional Income" value={fmt(res.provisionalIncome)} />
              <Line
                label={`Taxable Social Security (${res.netSS > 0 ? Math.round((res.ssaTaxable / res.netSS) * 100) : 0}%)`}
                value={fmt(res.ssaTaxable)}
                bold
              />
              <Line label="Other Taxable Income" value={fmt(res.otherTaxable)} />
              <Line label="Adjusted Gross Income" value={fmt(res.agi)} bold highlight />
              <Line
                label={
                  ov.useItemized && ov.itemizedAmount > 0
                    ? "Itemized Deductions"
                    : `Standard Deduction (${ov.filingStatus}, ${ov.age65Plus !== false ? "65+" : "<65"})`
                }
                value={`(${fmt(res.deduction)})`}
                color="text-blue-600"
              />
              <Line label="Taxable Income" value={fmt(res.taxableIncome)} bold />
              <div className="border-b-2 border-slate-900 dark:border-slate-100 py-1.5 flex justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100">Estimated Tax Liability</span>
                <span className="font-mono font-bold text-sm">{fmt(res.taxLiability)}</span>
              </div>
              <Line label="Federal Withholding" value={`(${fmt(res.withholding)})`} color="text-green-600" />
              {res.credits > 0 && <Line label="Credits" value={`(${fmt(res.credits)})`} color="text-green-600" />}
              <div className="pt-2 flex justify-between items-center">
                <span
                  className={`font-extrabold text-sm ${
                    res.balanceDue > 0 ? "text-red-600" : res.balanceDue < 0 ? "text-green-600" : "text-slate-600"
                  }`}
                >
                  {res.balanceDue > 0 ? "BALANCE DUE" : res.balanceDue < 0 ? "REFUND" : "EVEN"}
                </span>
                <span
                  className={`font-mono font-extrabold text-base px-3 py-0.5 rounded-md ${
                    res.balanceDue > 0
                      ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                      : "text-green-600 bg-green-50 dark:bg-green-950/20"
                  }`}
                >
                  {res.balanceDue < 0 ? `(${fmt(Math.abs(res.balanceDue))})` : fmt(res.balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Filing requirement */}
          <div
            className={`p-3.5 rounded-lg border ${
              res.filingRequired
                ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50"
                : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50"
            }`}
          >
            <div className={`text-xs font-bold mb-1 ${res.filingRequired ? "text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300"}`}>
              Filing Requirement: {res.filingRequired ? "REQUIRED" : "Not Required"}
            </div>
            <div className={`text-[11px] ${res.filingRequired ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              Gross income {fmt(res.grossIncome)} {res.filingRequired ? "exceeds" : "does not exceed"}{" "}
              {fmt(res.filingThreshold)} threshold
              {income.fedWithheld > 0 && !res.filingRequired &&
                " (but withholding credit exists \u2014 filing recommended to claim refund)"}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({
  label,
  value,
  bold,
  highlight,
  color,
}: {
  label: string
  value: string
  bold?: boolean
  highlight?: boolean
  color?: string
}) {
  return (
    <div
      className={`flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 ${
        highlight ? "bg-slate-50 dark:bg-slate-800/30 -mx-2 px-2 rounded" : ""
      }`}
    >
      <span className={bold ? "font-bold text-slate-900 dark:text-slate-100" : "text-slate-400"}>
        {label}
      </span>
      <span className={`font-mono ${bold ? "font-semibold" : ""} ${color || "text-slate-700 dark:text-slate-300"}`}>
        {value}
      </span>
    </div>
  )
}
