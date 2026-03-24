"use client"

import type { TaxpayerInfo } from "./cleared-rcc"
import type { ReturnEstimate } from "@/lib/tax/engine"
import { RCCAssumptions } from "./rcc-assumptions"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n < 0
      ? `(${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })})`
      : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

interface RCCDashboardProps {
  taxpayer: TaxpayerInfo | null
  years: string[]
  rawYears: Record<string, any>
  getYearResults: (yr: string) => ReturnEstimate
  globalEntityType: string
  globalFilingStatus: string
  globalAge65: boolean
  setGlobalEntityType: (v: string) => void
  setGlobalFilingStatus: (v: string) => void
  setGlobalAge65: (v: boolean) => void
  onSelectYear: (yr: string) => void
}

export function RCCDashboard({
  taxpayer,
  years,
  rawYears,
  getYearResults,
  globalEntityType,
  globalFilingStatus,
  globalAge65,
  setGlobalEntityType,
  setGlobalFilingStatus,
  setGlobalAge65,
  onSelectYear,
}: RCCDashboardProps) {
  // Collect flags
  const flags: { yr: string; type: "critical" | "warning" | "info"; msg: string }[] = []
  for (const yr of years) {
    const acct = rawYears[yr]?.account
    if (acct?.transactions) {
      for (const t of acct.transactions) {
        if (t.code === "540") flags.push({ yr, type: "critical", msg: `TC 540 \u2014 Deceased taxpayer (${t.date})` })
        if (t.code === "590") flags.push({ yr, type: "critical", msg: "TC 590 \u2014 ASFR/SFR assessment" })
        if (t.code === "582") flags.push({ yr, type: "warning", msg: "TC 582 \u2014 Federal tax lien filed" })
        if (t.code === "530") flags.push({ yr, type: "info", msg: "TC 530 \u2014 Currently not collectible" })
      }
    }
  }

  if (years.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">No transcript data loaded. Upload transcripts to get started.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Taxpayer Dashboard</h2>
      {taxpayer && (
        <p className="text-sm text-slate-500 mb-5">
          {taxpayer.name} | SSN: XXX-XX-{taxpayer.ssn_last4}
        </p>
      )}

      <RCCAssumptions
        entityType={globalEntityType}
        filingStatus={globalFilingStatus}
        age65={globalAge65}
        onEntityType={setGlobalEntityType}
        onFilingStatus={setGlobalFilingStatus}
        onAge65={setGlobalAge65}
      />

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mb-5 space-y-1.5">
          {flags.map((f, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                f.type === "critical"
                  ? "bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/50"
                  : f.type === "warning"
                    ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50"
                    : "bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50"
              }`}
            >
              <span className="font-mono font-bold text-xs">TY {f.yr}</span>
              {f.msg}
            </div>
          ))}
        </div>
      )}

      {/* Summary table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 dark:bg-slate-800 text-white text-[11px] uppercase tracking-wider">
              {["Year", "Return Filed", "Gross Income", "Est. AGI", "Taxable Income", "Tax Liability", "Withholding", "Balance Due/(Refund)", "Filing Req?"].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2.5 font-semibold ${h === "Year" ? "text-left" : "text-right"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((yr, i) => {
              const res = getYearResults(yr)
              const acct = rawYears[yr]?.account
              const retFiled = acct?.return_filed || rawYears[yr]?.tax_return?.filed
              return (
                <tr
                  key={yr}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/20 ${
                    i % 2 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-slate-900"
                  }`}
                  onClick={() => onSelectYear(yr)}
                >
                  <td className="px-3 py-2.5 font-bold font-mono">{yr}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        retFiled
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {retFiled ? "Filed" : "NOT FILED"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(res.grossIncome)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(res.agi)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(res.taxableIncome)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(res.taxLiability)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(res.withholding)}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-bold ${
                      res.balanceDue > 0
                        ? "text-red-600"
                        : res.balanceDue < 0
                          ? "text-green-600"
                          : "text-slate-600"
                    }`}
                  >
                    {res.balanceDue < 0 ? `(${fmt(Math.abs(res.balanceDue))})` : fmt(res.balanceDue)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-[11px] font-semibold ${res.filingRequired ? "text-red-600" : "text-slate-400"}`}>
                      {res.filingRequired ? "YES" : "No"}
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
