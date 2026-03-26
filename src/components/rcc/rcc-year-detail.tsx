"use client"

import type { ReturnEstimate } from "@/lib/tax/engine"
import { TC_CODES, CRITICAL_TC, assessConfidence } from "@/lib/tax/engine"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtD = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-c-success-soft dark:bg-c-success/10", text: "text-c-success dark:text-c-success", label: "High" },
    medium: { bg: "bg-c-warning-soft dark:bg-c-warning/10", text: "text-c-warning dark:text-c-warning", label: "Medium" },
    low: { bg: "bg-c-danger-soft dark:bg-c-danger/10", text: "text-c-danger dark:text-c-danger", label: "Low" },
    none: { bg: "bg-c-gray-100 dark:bg-c-gray-900", text: "text-c-gray-500", label: "No Data" },
  }
  const m = map[level] || map.none
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${m.bg} ${m.text}`}>{m.label}</span>
}

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
  selectedYear, years, rawYears, getYearIncome, getYearOverrides, getYearResults, updateOverride, onSelectYear,
}: RCCYearDetailProps) {
  const yr = selectedYear
  if (!yr || !rawYears[yr]) {
    return <div className="text-center py-16 text-c-gray-300">Select a year from the Dashboard to view details.</div>
  }

  const yd = rawYears[yr]
  const income = getYearIncome(yr)
  const ov = getYearOverrides(yr)
  const res = getYearResults(yr)
  const forms = yd?.wage_income?.forms || []
  const conf = assessConfidence(yd)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100">Tax Year {yr}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-c-gray-300">Return Estimator & Transcript Detail</span>
            <ConfidenceBadge level={conf.level} />
          </div>
        </div>
      </div>

      {/* Year Rail */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {years.map((y) => {
          const active = y === yr
          const yRes = getYearResults(y)
          const yAcct = rawYears[y]?.account
          const yFiled = yAcct?.return_filed || rawYears[y]?.tax_return?.filed
          const yConf = assessConfidence(rawYears[y])
          return (
            <button
              key={y}
              onClick={() => onSelectYear(y)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[72px] rounded-lg border transition-all ${
                active
                  ? "bg-c-gray-900 dark:bg-c-gray-100 border-c-gray-900 dark:border-c-gray-100"
                  : "bg-white dark:bg-c-gray-900 border-c-gray-100 dark:border-c-gray-700 hover:border-c-gray-300"
              }`}
            >
              <span className={`font-mono text-sm font-medium ${active ? "text-white dark:text-c-gray-900" : "text-c-gray-900 dark:text-c-gray-100"}`}>{y}</span>
              <span className={`text-[9px] font-medium ${active ? "text-c-gray-300 dark:text-c-gray-500" : yFiled ? "text-c-success" : yConf.level === "none" ? "text-c-gray-300" : "text-c-danger"}`}>
                {yFiled ? "Filed" : yConf.level === "none" ? "No Data" : "Not Filed"}
              </span>
              {!active && yRes.balanceDue !== 0 && (
                <span className={`text-[9px] font-mono ${yRes.balanceDue > 0 ? "text-c-danger" : "text-c-success"}`}>
                  {yRes.balanceDue > 0 ? fmt(yRes.balanceDue) : `(${fmt(Math.abs(yRes.balanceDue))})`}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Confidence disclaimer */}
      {conf.level !== "high" && (
        <div className="mb-4 px-3 py-2 bg-c-warning-soft dark:bg-c-warning/20 border border-c-warning/20 dark:border-c-warning/30/50 rounded-md text-[11px] text-c-warning dark:text-c-warning italic">
          {conf.reason}. Results may be incomplete.
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* LEFT: Source Evidence */}
        <div className="space-y-3">
          <div className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">Source Evidence &mdash; TY {yr}</div>

          {/* Income Forms — expandable */}
          {forms.length === 0 ? (
            <div className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg p-4 text-center text-c-gray-300">
              <div className="text-2xl mb-2">📄</div>
              <div className="text-xs font-medium text-c-gray-500">No W&I transcript data</div>
              <div className="text-[11px]">Upload Wage & Income transcript for this year</div>
            </div>
          ) : (
            forms.map((f: any, i: number) => (
              <details key={i} className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg" open={i === 0}>
                <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg text-sm font-medium text-c-gray-900 dark:text-c-gray-100">
                  {f.type} &mdash; {f.payer}
                  {f.ein && <span className="text-[10px] text-c-gray-300 font-normal ml-2">EIN {f.ein}</span>}
                </summary>
                <div className="px-3 pb-3 border-t border-c-gray-100 dark:border-c-gray-900">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2">
                    {Object.entries(f.fields || {})
                      .filter(([, v]) => v && v !== 0 && typeof v !== "object")
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between py-0.5 border-b border-c-gray-50 dark:border-c-gray-900">
                          <span className="text-c-gray-300">{k.replace(/_/g, " ")}</span>
                          <span className="font-mono font-medium text-c-gray-700 dark:text-c-gray-300">
                            {typeof v === "number" ? fmtD(v) : String(v)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </details>
            ))
          )}

          {/* Account Transcript — expandable */}
          {yd?.account && (
            <details className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg">
              <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg text-sm font-medium text-c-gray-900 dark:text-c-gray-100">
                Account Transcript
                <span className="text-[10px] text-c-gray-300 font-normal ml-2">
                  Bal: {fmt(yd.account.balance || 0)}
                  {(yd.account.accrued_interest || 0) > 0 && ` · Int: ${fmt(yd.account.accrued_interest)}`}
                  {(yd.account.accrued_penalty || 0) > 0 && ` · Pen: ${fmt(yd.account.accrued_penalty)}`}
                </span>
              </summary>
              <div className="px-3 pb-3 border-t border-c-gray-100 dark:border-c-gray-900">
                {(yd.account.transactions || []).length > 0 ? (
                  <table className="w-full text-[11px] mt-2">
                    <thead>
                      <tr className="border-b-2 border-c-gray-100 dark:border-c-gray-700">
                        {["Code", "Description", "Date", "Amount"].map((h) => (
                          <th key={h} className={`py-1 px-1.5 text-c-gray-300 font-medium ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(yd.account.transactions || []).map((t: any, j: number) => {
                        const isCritical = CRITICAL_TC.has(t.code)
                        return (
                          <tr key={j} className={`border-b border-c-gray-100 dark:border-c-gray-900 ${isCritical ? "bg-c-danger-soft dark:bg-c-danger/20" : ""}`}>
                            <td className={`py-1 px-1.5 font-mono font-medium ${isCritical ? "text-c-danger" : "text-c-gray-700 dark:text-c-gray-300"}`} title={TC_CODES[t.code]}>{t.code || "\u2014"}</td>
                            <td className="py-1 px-1.5 text-c-gray-500">{t.description || TC_CODES[t.code] || "\u2014"}</td>
                            <td className="py-1 px-1.5 font-mono text-c-gray-300">{t.date || "\u2014"}</td>
                            <td className={`py-1 px-1.5 text-right font-mono ${t.amount < 0 ? "text-c-success" : "text-c-gray-700 dark:text-c-gray-300"}`}>{t.amount != null ? fmtD(t.amount) : "\u2014"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-c-gray-300 italic py-2">No transaction codes recorded</div>
                )}
              </div>
            </details>
          )}
        </div>

        {/* RIGHT: Return Estimator */}
        <div>
          <div className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider mb-2">Return Estimate &mdash; TY {yr}</div>

          {/* Estimate disclaimer */}
          <div className="mb-3 px-3 py-2 bg-c-warning-soft dark:bg-c-warning/20 border border-c-warning/20 dark:border-c-warning/30/50 rounded-md text-[11px] text-c-warning dark:text-c-warning italic">
            Estimate only. Uses simplified SS taxability, standard bracket computation, and assumed filing status. Not a substitute for professional return preparation.
          </div>

          <div className="border-2 border-c-gray-900 dark:border-c-gray-100 rounded-lg p-4 mb-4">
            {/* Overrides */}
            <details className="mb-4">
              <summary className="text-xs font-medium text-c-gray-500 cursor-pointer hover:text-c-gray-700 dark:hover:text-c-gray-300">
                Show Overrides
              </summary>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <label className="text-[11px] text-c-gray-300">
                  Filing Status
                  <select value={ov.filingStatus} onChange={(e) => updateOverride(yr, "filingStatus", e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded border border-c-gray-100 dark:border-c-gray-700 text-xs bg-white dark:bg-c-gray-900">
                    <option value="single">Single</option><option value="mfj">MFJ</option><option value="mfs">MFS</option><option value="hoh">HoH</option>
                  </select>
                </label>
                {[
                  ["additionalIncome", "Add'l Income", "0"],
                  ["itemizedAmount", "Itemized Ded.", "0 = standard"],
                  ["credits", "Credits", "0"],
                  ["additionalWithholding", "Add'l W/H", "0"],
                ].map(([key, label, ph]) => (
                  <label key={key} className="text-[11px] text-c-gray-300">
                    {label}
                    <input type="number" value={ov[key] || ""} onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0
                      updateOverride(yr, key, v)
                      if (key === "itemizedAmount") updateOverride(yr, "useItemized", v > 0)
                    }} placeholder={ph} className="w-full mt-1 px-2 py-1.5 rounded border border-c-gray-100 dark:border-c-gray-700 text-xs font-mono bg-white dark:bg-c-gray-900" />
                  </label>
                ))}
                <label className="text-[11px] text-c-gray-300">
                  Notes
                  <input value={ov.notes || ""} onChange={(e) => updateOverride(yr, "notes", e.target.value)} placeholder="Practitioner notes" className="w-full mt-1 px-2 py-1.5 rounded border border-c-gray-100 dark:border-c-gray-700 text-xs bg-white dark:bg-c-gray-900" />
                </label>
              </div>
            </details>

            {/* Computation lines */}
            <div className="text-xs space-y-0">
              <Line label="Net Social Security Benefits" value={fmt(res.netSS)} bold />
              <Line label="Provisional Income" value={fmt(res.provisionalIncome)} sub note="half SS + other income" />
              <Line label={`Taxable Social Security (${res.netSS > 0 ? Math.round((res.ssaTaxable / res.netSS) * 100) : 0}%)`} value={fmt(res.ssaTaxable)} bold />
              <Line label="Other Taxable Income" value={fmt(res.otherTaxable)} sub />
              <Line label="Adjusted Gross Income" value={fmt(res.agi)} bold highlight />
              <Line
                label={ov.useItemized && ov.itemizedAmount > 0 ? "Itemized Deductions" : `Standard Deduction (${ov.filingStatus}, ${ov.age65Plus !== false ? "65+" : "<65"})`}
                value={`(${fmt(res.deduction)})`} color="text-c-teal"
              />
              <Line label="Taxable Income" value={fmt(res.taxableIncome)} bold />
              <div className="border-b-2 border-c-gray-900 dark:border-c-gray-100 py-1.5 flex justify-between">
                <span className="font-medium text-c-gray-900 dark:text-c-gray-100">Estimated Tax Liability</span>
                <span className="font-mono font-medium text-sm">{fmt(res.taxLiability)}</span>
              </div>
              <Line label="Federal Withholding" value={`(${fmt(res.withholding)})`} color="text-c-success" />
              {res.credits > 0 && <Line label="Credits" value={`(${fmt(res.credits)})`} color="text-c-success" />}
              <div className="pt-2 flex justify-between items-center">
                <span className={`font-extrabold text-sm ${res.balanceDue > 0 ? "text-c-danger" : res.balanceDue < 0 ? "text-c-success" : "text-c-gray-500"}`}>
                  {res.balanceDue > 0 ? "BALANCE DUE" : res.balanceDue < 0 ? "REFUND" : "EVEN"}
                </span>
                <span className={`font-mono font-extrabold text-base px-3 py-0.5 rounded-md ${
                  res.balanceDue > 0 ? "text-c-danger bg-c-danger-soft dark:bg-c-danger/20" : "text-c-success bg-c-success-soft dark:bg-c-success/20"
                }`}>
                  {res.balanceDue < 0 ? `(${fmt(Math.abs(res.balanceDue))})` : fmt(res.balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Filing requirement */}
          <div className={`p-3.5 rounded-lg border ${
            res.filingRequired
              ? "bg-c-danger-soft dark:bg-c-danger/20 border-c-danger/20 dark:border-c-danger/30/50"
              : "bg-c-success-soft dark:bg-c-success/20 border-c-success/20 dark:border-c-success/30/50"
          }`}>
            <div className={`text-xs font-medium mb-1 ${res.filingRequired ? "text-c-danger dark:text-c-danger" : "text-c-success dark:text-c-success"}`}>
              Filing {res.filingRequired ? "REQUIRED" : "Not Required"}
            </div>
            <div className={`text-[11px] ${res.filingRequired ? "text-c-danger dark:text-c-danger" : "text-c-success dark:text-c-success"}`}>
              Gross {fmt(res.grossIncome)} vs. {fmt(res.filingThreshold)} threshold
              {income.fedWithheld > 0 && !res.filingRequired && " (withholding exists \u2014 filing recommended to claim refund)"}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, bold, highlight, color, sub, note }: {
  label: string; value: string; bold?: boolean; highlight?: boolean; color?: string; sub?: boolean; note?: string
}) {
  return (
    <div className={`flex justify-between py-1 border-b border-c-gray-100 dark:border-c-gray-900 ${highlight ? "bg-c-snow dark:bg-c-gray-900/30 -mx-2 px-2 rounded" : ""}`}>
      <span className={`${bold ? "font-medium text-c-gray-900 dark:text-c-gray-100" : "text-c-gray-300"} ${sub ? "pl-4" : ""}`}>
        {label}
        {note && <span className="text-[9px] text-c-gray-300 italic ml-1.5">({note})</span>}
      </span>
      <span className={`font-mono ${bold ? "font-medium" : ""} ${color || "text-c-gray-700 dark:text-c-gray-300"}`}>{value}</span>
    </div>
  )
}
