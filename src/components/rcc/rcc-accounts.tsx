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
      <div className="text-center py-16 text-c-gray-300">
        <p className="text-sm">No data loaded.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100 mb-1">
            Account Transcript Activity
          </h2>
          <p className="text-sm text-c-gray-500">
            All IRS transaction codes across all years. Hover codes for descriptions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            placeholder="Filter by TC code\u2026"
            className="px-2.5 py-1.5 rounded-md border border-c-gray-200 dark:border-c-gray-500 text-xs font-mono bg-white dark:bg-c-gray-900 w-40"
          />
          <label className="flex items-center gap-1.5 text-xs text-c-gray-500 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={critOnly}
              onChange={(e) => setCritOnly(e.target.checked)}
              className="rounded border-c-gray-200"
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
              className="mb-4 p-3 bg-c-snow dark:bg-c-gray-900/30 rounded-lg border border-c-gray-100 dark:border-c-gray-700"
            >
              <span className="font-mono font-medium mr-2">TY {yr}</span>
              <span className="text-c-gray-300 text-sm">No account data / Requested data not found</span>
            </div>
          )
        }

        return (
          <details key={yr} className="mb-4 border border-c-gray-100 dark:border-c-gray-700 rounded-lg" open={txns.some((t: any) => CRITICAL_TC.has(t.code))}>
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg">
              <span className="font-mono font-medium text-sm text-c-gray-900 dark:text-c-gray-100">TY {yr}</span>
              <span className="text-xs text-c-gray-300">
                Balance: <strong className="text-c-gray-700 dark:text-c-gray-300">{fmt(acct.balance || 0)}</strong>
              </span>
              {(acct.accrued_interest || 0) > 0 && (
                <span className="text-xs text-c-danger">Int: {fmt(acct.accrued_interest)}</span>
              )}
              {(acct.accrued_penalty || 0) > 0 && (
                <span className="text-xs text-c-danger">Pen: {fmt(acct.accrued_penalty)}</span>
              )}
              {(acct.flags || []).map((fl: string, fi: number) => (
                <span key={fi} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger">{fl}</span>
              ))}
            </summary>
            <div className="px-4 pb-4 border-t border-c-gray-100 dark:border-c-gray-900">
              {txns.length > 0 ? (
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="border-b-2 border-c-gray-100 dark:border-c-gray-700">
                      <th className="py-1.5 px-2 text-left font-medium text-c-gray-300 w-14">Code</th>
                      <th className="py-1.5 px-2 text-left font-medium text-c-gray-300">Description</th>
                      <th className="py-1.5 px-2 text-left font-medium text-c-gray-300 w-20">Cycle</th>
                      <th className="py-1.5 px-2 text-left font-medium text-c-gray-300 w-24">Date</th>
                      <th className="py-1.5 px-2 text-right font-medium text-c-gray-300 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t: any, j: number) => {
                      const isCritical = CRITICAL_TC.has(t.code)
                      return (
                        <tr
                          key={j}
                          className={`border-b border-c-gray-100 dark:border-c-gray-900 ${
                            isCritical ? "bg-c-danger-soft dark:bg-c-danger/20" : ""
                          }`}
                        >
                          <td
                            className={`py-1.5 px-2 font-mono font-medium ${
                              isCritical ? "text-c-danger" : "text-c-gray-700 dark:text-c-gray-300"
                            }`}
                            title={TC_CODES[t.code] || ""}
                          >
                            {t.code || "\u2014"}
                          </td>
                          <td className="py-1.5 px-2 text-c-gray-500">{t.description || TC_CODES[t.code] || "\u2014"}</td>
                          <td className="py-1.5 px-2 font-mono text-c-gray-300">{t.cycle || "\u2014"}</td>
                          <td className="py-1.5 px-2 font-mono text-c-gray-300">{t.date || "\u2014"}</td>
                          <td
                            className={`py-1.5 px-2 text-right font-mono font-medium ${
                              t.amount < 0 ? "text-c-success" : t.amount > 0 ? "text-c-gray-700 dark:text-c-gray-300" : "text-c-gray-300"
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
                <div className="text-xs text-c-gray-300 italic py-3">No matching transactions</div>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
