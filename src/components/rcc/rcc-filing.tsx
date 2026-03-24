"use client"

import type { ReturnEstimate } from "@/lib/tax/engine"
import { RCCAssumptions } from "./rcc-assumptions"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

interface RCCFilingProps {
  years: string[]
  rawYears: Record<string, any>
  getYearOverrides: (yr: string) => any
  getYearResults: (yr: string) => ReturnEstimate
  globalEntityType: string
  globalFilingStatus: string
  globalAge65: boolean
  setGlobalEntityType: (v: string) => void
  setGlobalFilingStatus: (v: string) => void
  setGlobalAge65: (v: boolean) => void
}

export function RCCFiling({
  years,
  rawYears,
  getYearOverrides,
  getYearResults,
  globalEntityType,
  globalFilingStatus,
  globalAge65,
  setGlobalEntityType,
  setGlobalFilingStatus,
  setGlobalAge65,
}: RCCFilingProps) {
  if (years.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">No data loaded.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        Filing Requirements Analysis
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Determines whether a return was required for each year based on gross income, filing status,
        and entity type.
      </p>

      <RCCAssumptions
        entityType={globalEntityType}
        filingStatus={globalFilingStatus}
        age65={globalAge65}
        onEntityType={setGlobalEntityType}
        onFilingStatus={setGlobalFilingStatus}
        onAge65={setGlobalAge65}
      />

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 dark:bg-slate-800 text-white text-[11px] uppercase tracking-wider">
              {["Year", "Entity", "Status", "Gross Income", "Threshold", "Required?", "Filed?", "Action"].map((h) => (
                <th key={h} className={`px-3 py-2.5 font-semibold ${h === "Year" ? "text-left" : "text-center"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((yr, i) => {
              const res = getYearResults(yr)
              const ov = getYearOverrides(yr)
              const acct = rawYears[yr]?.account
              const filed = acct?.return_filed || rawYears[yr]?.tax_return?.filed

              let action = "\u2014"
              if (res.filingRequired && !filed) {
                action = res.balanceDue > 0 ? "FILE \u2014 Balance Due" : "FILE \u2014 Refund Available"
              } else if (!res.filingRequired && !filed && res.withholding > 0) {
                action = "OPTIONAL \u2014 Claim Refund"
              } else if (filed) {
                action = "No action needed"
              }

              return (
                <tr
                  key={yr}
                  className={i % 2 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-slate-900"}
                >
                  <td className="px-3 py-2.5 font-bold font-mono">{yr}</td>
                  <td className="px-3 py-2.5 text-center text-[11px] text-slate-400">
                    {ov.entityType === "individual" ? "1040" : "1041"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[11px]">{ov.filingStatus?.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.grossIncome)}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-400">{fmt(res.filingThreshold)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`font-bold ${res.filingRequired ? "text-red-600" : "text-slate-400"}`}>
                      {res.filingRequired ? "YES" : "No"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        filed
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {filed ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`text-[11px] font-semibold ${
                        action.startsWith("FILE")
                          ? "text-red-600"
                          : action.startsWith("OPTIONAL")
                            ? "text-amber-600"
                            : "text-slate-400"
                      }`}
                    >
                      {action}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
