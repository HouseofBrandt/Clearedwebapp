"use client"

import { useState } from "react"
import { TC_CODES, CRITICAL_TC } from "@/lib/tax/engine"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtD = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

interface RCCAccountsProps {
  years: string[]
  rawYears: Record<string, any>
}

export function RCCAccounts({ years, rawYears }: RCCAccountsProps) {
  const [codeFilter, setCodeFilter] = useState("")
  const [critOnly, setCritOnly] = useState(false)

  if (years.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">No data loaded.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            Account Transcript Activity
          </h2>
          <p className="text-sm text-slate-500">
            All IRS transaction codes across all years. Hover codes for descriptions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            placeholder="Filter by TC code\u2026"
            className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-mono bg-white dark:bg-slate-900 w-40"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={critOnly}
              onChange={(e) => setCritOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            Critical only
          </label>
        </div>
      </div>

      {years.map((yr) => {
        const acct = rawYears[yr]?.account
        let txns = acct?.transactions || []
        if (codeFilter) txns = txns.filter((t: any) => (t.code || "").includes(codeFilter))
        if (critOnly) txns = txns.filter((t: any) => CRITICAL_TC.has(t.code))

        if (!acct) {
          return (
            <div
              key={yr}
              className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <span className="font-mono font-bold mr-2">TY {yr}</span>
              <span className="text-slate-400 text-sm">No account data / Requested data not found</span>
            </div>
          )
        }

        return (
          <details key={yr} className="mb-4 border border-slate-200 dark:border-slate-700 rounded-lg" open={txns.some((t: any) => CRITICAL_TC.has(t.code))}>
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg">
              <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">TY {yr}</span>
              <span className="text-xs text-slate-400">
                Balance: <strong className="text-slate-700 dark:text-slate-300">{fmt(acct.balance || 0)}</strong>
              </span>
              {(acct.accrued_interest || 0) > 0 && (
                <span className="text-xs text-red-500">Int: {fmt(acct.accrued_interest)}</span>
              )}
              {(acct.accrued_penalty || 0) > 0 && (
                <span className="text-xs text-red-500">Pen: {fmt(acct.accrued_penalty)}</span>
              )}
              {(acct.flags || []).map((fl: string, fi: number) => (
                <span key={fi} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{fl}</span>
              ))}
            </summary>
            <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
              {txns.length > 0 ? (
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      <th className="py-1.5 px-2 text-left font-semibold text-slate-400 w-14">Code</th>
                      <th className="py-1.5 px-2 text-left font-semibold text-slate-400">Description</th>
                      <th className="py-1.5 px-2 text-left font-semibold text-slate-400 w-20">Cycle</th>
                      <th className="py-1.5 px-2 text-left font-semibold text-slate-400 w-24">Date</th>
                      <th className="py-1.5 px-2 text-right font-semibold text-slate-400 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t: any, j: number) => {
                      const isCritical = CRITICAL_TC.has(t.code)
                      return (
                        <tr
                          key={j}
                          className={`border-b border-slate-100 dark:border-slate-800 ${
                            isCritical ? "bg-red-50 dark:bg-red-950/20" : ""
                          }`}
                        >
                          <td
                            className={`py-1.5 px-2 font-mono font-bold ${
                              isCritical ? "text-red-600" : "text-slate-700 dark:text-slate-300"
                            }`}
                            title={TC_CODES[t.code] || ""}
                          >
                            {t.code || "\u2014"}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500">{t.description || TC_CODES[t.code] || "\u2014"}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-400">{t.cycle || "\u2014"}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-400">{t.date || "\u2014"}</td>
                          <td
                            className={`py-1.5 px-2 text-right font-mono font-semibold ${
                              t.amount < 0 ? "text-green-600" : t.amount > 0 ? "text-slate-700 dark:text-slate-300" : "text-slate-400"
                            }`}
                          >
                            {t.amount != null ? fmtD(t.amount) : "\u2014"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-slate-400 italic py-3">No matching transactions</div>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
