"use client"

import { TC_CODES } from "@/lib/tax/engine"

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
        Account Transcript Activity
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        All IRS transaction codes across all years. Hover codes for descriptions.
      </p>

      {years.map((yr) => {
        const acct = rawYears[yr]?.account
        if (!acct?.transactions?.length) {
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
          <div key={yr} className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">TY {yr}</span>
              <span className="text-xs text-slate-400">
                Balance: <strong className="text-slate-700 dark:text-slate-300">{fmt(acct.balance || 0)}</strong>
              </span>
              {(acct.accrued_interest || 0) > 0 && (
                <span className="text-xs text-red-500">Interest: {fmt(acct.accrued_interest)}</span>
              )}
              {(acct.accrued_penalty || 0) > 0 && (
                <span className="text-xs text-red-500">Penalty: {fmt(acct.accrued_penalty)}</span>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                    <th className="py-1.5 px-2.5 text-left font-semibold text-slate-400 w-14">Code</th>
                    <th className="py-1.5 px-2.5 text-left font-semibold text-slate-400">Description</th>
                    <th className="py-1.5 px-2.5 text-left font-semibold text-slate-400 w-20">Cycle</th>
                    <th className="py-1.5 px-2.5 text-left font-semibold text-slate-400 w-24">Date</th>
                    <th className="py-1.5 px-2.5 text-right font-semibold text-slate-400 w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {acct.transactions.map((t: any, j: number) => {
                    const isCritical = ["540", "590", "582", "598"].includes(t.code)
                    return (
                      <tr
                        key={j}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          isCritical ? "bg-red-50 dark:bg-red-950/20" : ""
                        }`}
                      >
                        <td
                          className={`py-1.5 px-2.5 font-mono font-bold ${
                            isCritical ? "text-red-600" : "text-slate-700 dark:text-slate-300"
                          }`}
                          title={TC_CODES[t.code] || ""}
                        >
                          {t.code || "\u2014"}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-500">{t.description || TC_CODES[t.code] || "\u2014"}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-400">{t.cycle || "\u2014"}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-400">{t.date || "\u2014"}</td>
                        <td
                          className={`py-1.5 px-2.5 text-right font-mono font-semibold ${
                            t.amount < 0
                              ? "text-green-600"
                              : t.amount > 0
                                ? "text-slate-700 dark:text-slate-300"
                                : "text-slate-400"
                          }`}
                        >
                          {t.amount != null ? fmtD(t.amount) : "\u2014"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
