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
    high: { bg: "bg-c-success-soft dark:bg-c-success/10", text: "text-c-success dark:text-c-success", label: "High" },
    medium: { bg: "bg-c-warning-soft dark:bg-c-warning/10", text: "text-c-warning dark:text-c-warning", label: "Medium" },
    low: { bg: "bg-c-danger-soft dark:bg-c-danger/10", text: "text-c-danger dark:text-c-danger", label: "Low" },
    none: { bg: "bg-c-gray-100 dark:bg-c-gray-900", text: "text-c-gray-500", label: "No Data" },
  }
  const m = map[level] || map.none
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${m.bg} ${m.text}`}>{m.label}</span>
}

function FilingBadge({ filed, present }: { filed: boolean; present?: boolean }) {
  if (filed) return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-success-soft dark:bg-c-success/10 text-c-success dark:text-c-success">Yes</span>
  if (present === false) return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-gray-100 dark:bg-c-gray-900 text-c-gray-500">No Data</span>
  return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger">No</span>
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
    return <div className="text-center py-16 text-c-gray-300"><p className="text-sm">No data loaded.</p></div>
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100 mb-1">Filing Requirements Analysis</h2>
      <p className="text-sm text-c-gray-500 mb-4">
        Determines whether a return was required for each year based on gross income, filing status, and entity type.
      </p>

      {/* Disclaimer */}
      <div className="mb-4 px-3 py-2 bg-c-warning-soft dark:bg-c-warning/20 border border-c-warning/20 dark:border-c-warning/30/50 rounded-md text-[11px] text-c-warning dark:text-c-warning italic">
        Filing requirement uses gross income vs. standard deduction threshold. Does not account for all IRC filing triggers (e.g., self-employment tax, AMT, household employment tax). Manual review recommended.
      </div>

      <RCCAssumptions
        entityType={globalEntityType} filingStatus={globalFilingStatus} age65={globalAge65}
        onEntityType={setGlobalEntityType} onFilingStatus={setGlobalFilingStatus} onAge65={setGlobalAge65}
      />

      <div className="overflow-x-auto border border-c-gray-100 dark:border-c-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-c-gray-900 dark:bg-c-gray-900 text-white text-[11px] uppercase tracking-wider">
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
              let actionColor = "text-c-gray-300"
              if (conf.level === "none") { action = "Need transcripts"; actionColor = "text-c-gray-300" }
              else if (res.filingRequired && !filed) { action = res.balanceDue > 0 ? "FILE \u2014 Due" : "FILE \u2014 Refund"; actionColor = "text-c-danger" }
              else if (!res.filingRequired && !filed && res.withholding > 0) { action = "Optional \u2014 Refund"; actionColor = "text-c-warning" }
              else if (filed) { action = "None"; actionColor = "text-c-success" }

              return (
                <tr key={yr} className={i % 2 ? "bg-c-snow dark:bg-c-gray-900/30" : "bg-white dark:bg-c-gray-900"}>
                  <td className="px-3 py-2.5 font-medium font-mono">{yr}</td>
                  <td className="px-3 py-2.5 text-center text-[11px] text-c-gray-300">{ov.entityType === "individual" ? "1040" : "1041"}</td>
                  <td className="px-3 py-2.5 text-center text-[11px]">{ov.filingStatus?.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.grossIncome)}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-c-gray-300">{fmt(res.filingThreshold)}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`font-medium ${res.filingRequired ? "text-c-danger" : "text-c-gray-300"}`}>{res.filingRequired ? "YES" : "No"}</span></td>
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
