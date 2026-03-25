"use client"

import type { ReturnEstimate } from "@/lib/tax/engine"
import { assessConfidence } from "@/lib/tax/engine"
import { RCCAssumptions } from "./rcc-assumptions"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "High" },
    medium: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Medium" },
    low: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Low" },
    none: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500", label: "No Data" },
  }
  const m = map[level] || map.none
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${m.bg} ${m.text}`}>{m.label}</span>
}

function FilingBadge({ filed, present }: { filed: boolean; present?: boolean }) {
  if (filed) return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Yes</span>
  if (present === false) return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">No Data</span>
  return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">No</span>
}

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
  years, rawYears, getYearOverrides, getYearResults,
  globalEntityType, globalFilingStatus, globalAge65,
  setGlobalEntityType, setGlobalFilingStatus, setGlobalAge65,
}: RCCFilingProps) {
  if (years.length === 0) {
    return <div className="text-center py-16 text-slate-400"><p className="text-sm">No data loaded.</p></div>
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100 mb-1">Filing Requirements Analysis</h2>
      <p className="text-sm text-slate-500 mb-4">
        Determines whether a return was required for each year based on gross income, filing status, and entity type.
      </p>

      {/* Disclaimer */}
      <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-md text-[11px] text-amber-700 dark:text-amber-400 italic">
        Filing requirement uses gross income vs. standard deduction threshold. Does not account for all IRC filing triggers (e.g., self-employment tax, AMT, household employment tax). Manual review recommended.
      </div>

      <RCCAssumptions
        entityType={globalEntityType} filingStatus={globalFilingStatus} age65={globalAge65}
        onEntityType={setGlobalEntityType} onFilingStatus={setGlobalFilingStatus} onAge65={setGlobalAge65}
      />

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 dark:bg-slate-800 text-white text-[11px] uppercase tracking-wider">
              {["Year", "Entity", "Status", "Gross Income", "Threshold", "Required?", "Filed?", "Confidence", "Action"].map((h) => (
                <th key={h} className={`px-3 py-2.5 font-medium ${h === "Year" ? "text-left" : "text-center"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((yr, i) => {
              const res = getYearResults(yr)
              const ov = getYearOverrides(yr)
              const acct = rawYears[yr]?.account
              const filed = acct?.return_filed || rawYears[yr]?.tax_return?.filed
              const conf = assessConfidence(rawYears[yr])

              let action = "\u2014"
              let actionColor = "text-slate-400"
              if (conf.level === "none") { action = "Need transcripts"; actionColor = "text-slate-400" }
              else if (res.filingRequired && !filed) { action = res.balanceDue > 0 ? "FILE \u2014 Due" : "FILE \u2014 Refund"; actionColor = "text-red-600" }
              else if (!res.filingRequired && !filed && res.withholding > 0) { action = "Optional \u2014 Refund"; actionColor = "text-amber-600" }
              else if (filed) { action = "None"; actionColor = "text-green-600" }

              return (
                <tr key={yr} className={i % 2 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-slate-900"}>
                  <td className="px-3 py-2.5 font-medium font-mono">{yr}</td>
                  <td className="px-3 py-2.5 text-center text-[11px] text-slate-400">{ov.entityType === "individual" ? "1040" : "1041"}</td>
                  <td className="px-3 py-2.5 text-center text-[11px]">{ov.filingStatus?.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.grossIncome)}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-400">{fmt(res.filingThreshold)}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`font-medium ${res.filingRequired ? "text-red-600" : "text-slate-400"}`}>{res.filingRequired ? "YES" : "No"}</span></td>
                  <td className="px-3 py-2.5 text-center"><FilingBadge filed={filed} present={rawYears[yr]?.account?.return_present} /></td>
                  <td className="px-3 py-2.5 text-center"><ConfidenceBadge level={conf.level} /></td>
                  <td className={`px-3 py-2.5 text-center text-[11px] font-medium ${actionColor}`}>{action}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
