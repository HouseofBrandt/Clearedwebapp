"use client"

import { useRef } from "react"
import type { TaxpayerInfo } from "./cleared-rcc"
import type { ReturnEstimate } from "@/lib/tax/engine"
import { assessConfidence, getReviewFlags } from "@/lib/tax/engine"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

interface RCCExportProps {
  taxpayer: TaxpayerInfo | null
  years: string[]
  rawYears: Record<string, any>
  getYearResults: (yr: string) => ReturnEstimate
  getYearOverrides: (yr: string) => any
}

export function RCCExport({ taxpayer, years, rawYears, getYearResults, getYearOverrides }: RCCExportProps) {
  const ref = useRef<HTMLDivElement>(null)

  function handleCopy() {
    const el = ref.current
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    document.execCommand("copy")
    sel?.removeAllRanges()
  }

  if (years.length === 0) {
    return <div className="text-center py-16 text-c-gray-300"><p className="text-sm">No data loaded. Upload transcripts first.</p></div>
  }

  const flags = getReviewFlags(years, rawYears)

  const summaryText = `CLEARED \u2014 RETURN COMPLIANCE WORKING PAPERS
Prepared: ${new Date().toLocaleDateString()}
${"=".repeat(50)}
Taxpayer: ${taxpayer?.name || "Unknown"}
SSN: XXX-XX-${taxpayer?.ssn_last4 || "XXXX"}
${taxpayer?.addresses?.length ? `Address: ${taxpayer.addresses[0]}` : ""}
${flags.length > 0 ? `\nCRITICAL FLAGS:\n${flags.map(f => `  [${f.year}] ${f.code} \u2014 ${f.message}`).join("\n")}\n` : ""}
YEAR-BY-YEAR SUMMARY:
${years.map(yr => {
  const res = getYearResults(yr)
  const ov = getYearOverrides(yr)
  const conf = assessConfidence(rawYears[yr])
  const acct = rawYears[yr]?.account
  const filed = acct?.return_filed || rawYears[yr]?.tax_return?.filed
  return `
  TY ${yr} [Confidence: ${conf.level.toUpperCase()}]
  Status: ${ov.filingStatus?.toUpperCase() || "SINGLE"} | Filed: ${filed ? "Yes" : "NO"} | Filing Req: ${res.filingRequired ? "YES" : "No"}
  Gross Income: ${fmt(res.grossIncome)}  |  AGI: ${fmt(res.agi)}  |  Taxable: ${fmt(res.taxableIncome)}
  Est. Tax: ${fmt(res.taxLiability)}  |  Withholding: ${fmt(res.withholding)}  |  Balance: ${fmt(res.balanceDue)}
  ${ov.notes ? `Notes: ${ov.notes}` : ""}`
}).join("\n")}

DISCLAIMER: These are estimates produced using simplified tax computation
logic. Social Security taxability uses the Pub 915 worksheet approximation.
Filing thresholds are based on standard deduction; does not account for all
IRC filing triggers. Not a substitute for professional return preparation.`

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100 mb-1">Exportable Summary</h2>
          <p className="text-sm text-c-gray-500">Copy this working paper summary to your clipboard for case files.</p>
        </div>
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-md border border-c-gray-200 dark:border-c-gray-500 text-sm font-medium text-c-gray-700 dark:text-c-gray-300 bg-white dark:bg-c-gray-900 hover:bg-c-snow dark:hover:bg-c-gray-900 transition-colors"
        >
          Copy to Clipboard
        </button>
      </div>

      <div
        ref={ref}
        className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg p-5 bg-white dark:bg-c-gray-900 font-mono text-xs leading-relaxed whitespace-pre-wrap text-c-gray-700 dark:text-c-gray-300"
      >
        {summaryText}
      </div>
    </div>
  )
}
