"use client"

import { useMemo } from "react"
import type { TaxpayerInfo } from "./cleared-rcc"
import type { ReturnEstimate } from "@/lib/tax/engine"
import { assessConfidence, getReviewFlags, getNextActions, type ReviewFlag, type NextAction, type ConfidenceResult } from "@/lib/tax/engine"
import { detectFreezeCodesInTranscript, type FreezeCode } from "@/lib/tax/freeze-codes"
import { detectAnomalies, type TranscriptAnomaly } from "@/lib/tax/anomaly-detector"
import { detectCrossYearLinks, type CrossYearLink } from "@/lib/tax/cross-year-linker"
import { RCCAssumptions } from "./rcc-assumptions"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "\u2014"
    : n < 0
      ? `(${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })})`
      : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })

// ─── Confidence Badge ───
function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-c-success-soft dark:bg-c-success/10", text: "text-c-success dark:text-c-success", label: "High" },
    medium: { bg: "bg-c-warning-soft dark:bg-c-warning/10", text: "text-c-warning dark:text-c-warning", label: "Medium" },
    low: { bg: "bg-c-danger-soft dark:bg-c-danger/10", text: "text-c-danger dark:text-c-danger", label: "Low" },
    none: { bg: "bg-c-gray-100 dark:bg-c-gray-900", text: "text-c-gray-500", label: "No Data" },
  }
  const m = map[level] || map.none
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  )
}

// ─── Filing Badge (3 states) ───
function FilingBadge({ filed, present }: { filed: boolean; present?: boolean }) {
  if (filed) {
    return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-success-soft dark:bg-c-success/10 text-c-success dark:text-c-success">Filed</span>
  }
  if (present === false) {
    return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-gray-100 dark:bg-c-gray-900 text-c-gray-500">No Data</span>
  }
  return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger">Not Filed</span>
}

// ─── Summary Strip ───
function SummaryStrip({ taxpayer, years, rawYears, getYearResults }: {
  taxpayer: TaxpayerInfo | null
  years: string[]
  rawYears: Record<string, any>
  getYearResults: (yr: string) => ReturnEstimate
}) {
  const stats = useMemo(() => {
    let unfiledReq = 0, totalDue = 0, totalRefund = 0
    for (const yr of years) {
      const res = getYearResults(yr)
      const acct = rawYears[yr]?.account
      const filed = acct?.return_filed || rawYears[yr]?.tax_return?.filed
      if (res.filingRequired && !filed) unfiledReq++
      if (res.balanceDue > 0) totalDue += res.balanceDue
      if (res.balanceDue < 0) totalRefund += Math.abs(res.balanceDue)
    }
    const critFlags = getReviewFlags(years, rawYears).filter(f => f.severity === "critical").length
    return { unfiledReq, totalDue, totalRefund, critFlags }
  }, [years, rawYears, getYearResults])

  return (
    <div className="flex items-stretch rounded-xl overflow-hidden border border-c-gray-100 dark:border-c-gray-700 mb-5">
      <div className="bg-c-gray-900 dark:bg-c-gray-900 px-4 py-3 flex flex-col justify-center min-w-[180px]">
        <div className="text-sm font-medium text-white">{taxpayer?.name || "\u2014"}</div>
        <div className="text-[10px] text-c-gray-300">SSN: XXX-XX-{taxpayer?.ssn_last4 || "\u2014"}</div>
      </div>
      <div className="flex-1 flex items-center gap-6 px-5 py-3 bg-white dark:bg-c-gray-900 flex-wrap">
        <StatCell label="Years Loaded" value={String(years.length)} />
        <StatCell label="Unfiled (Req'd)" value={String(stats.unfiledReq)} accent={stats.unfiledReq > 0} />
        <StatCell label="Est. Total Due" value={fmt(stats.totalDue)} accent={stats.totalDue > 0} />
        <StatCell label="Refund Opportunities" value={fmt(stats.totalRefund)} green={stats.totalRefund > 0} />
        <StatCell label="Critical Flags" value={String(stats.critFlags)} accent={stats.critFlags > 0} />
      </div>
    </div>
  )
}

function StatCell({ label, value, accent, green }: { label: string; value: string; accent?: boolean; green?: boolean }) {
  return (
    <div className="min-w-[120px]">
      <div className="text-[10px] text-c-gray-300 mb-0.5">{label}</div>
      <div className={`text-base font-medium font-mono ${accent ? "text-c-danger" : green ? "text-c-success" : "text-c-gray-900 dark:text-c-gray-100"}`}>{value}</div>
    </div>
  )
}

// ─── Transcript Coverage Grid ───
function TranscriptCoverage({ years, rawYears }: { years: string[]; rawYears: Record<string, any> }) {
  return (
    <div className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg p-4 bg-white dark:bg-c-gray-900">
      <div className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider mb-3">Transcript Coverage</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-c-gray-100 dark:border-c-gray-700">
            {["Year", "W&I", "Acct", "Return", "Confidence"].map(h => (
              <th key={h} className={`py-1.5 px-2 text-[11px] font-medium text-c-gray-300 uppercase ${h === "Year" ? "text-left" : "text-center"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map(yr => {
            const yd = rawYears[yr]
            const hasWI = yd?.wage_income?.forms?.length > 0
            const hasAcct = !!yd?.account
            const hasRet = yd?.tax_return?.filed
            const conf = assessConfidence(yd)
            return (
              <tr key={yr} className="border-b border-c-gray-100 dark:border-c-gray-900">
                <td className="py-1.5 px-2 font-mono font-medium text-sm">{yr}</td>
                <td className="py-1.5 px-2 text-center"><Check ok={hasWI} /></td>
                <td className="py-1.5 px-2 text-center"><Check ok={hasAcct} /></td>
                <td className="py-1.5 px-2 text-center"><Check ok={hasRet} /></td>
                <td className="py-1.5 px-2 text-center"><ConfidenceBadge level={conf.level} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Check({ ok }: { ok: boolean }) {
  return <span className={`text-sm font-medium ${ok ? "text-c-success" : "text-c-gray-300 dark:text-c-gray-500"}`}>{ok ? "\u2713" : "\u2014"}</span>
}

// ─── Next Actions Panel ───
function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  if (!actions.length) return null
  const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    red: { bg: "bg-c-danger-soft dark:bg-c-danger/20", border: "border-c-danger/20 dark:border-c-danger/30/50", text: "text-c-danger dark:text-c-danger", dot: "bg-c-danger" },
    green: { bg: "bg-c-success-soft dark:bg-c-success/20", border: "border-c-success/20 dark:border-c-success/30/50", text: "text-c-success dark:text-c-success", dot: "bg-c-success" },
    amber: { bg: "bg-c-warning-soft dark:bg-c-warning/20", border: "border-c-warning/20 dark:border-c-warning/30/50", text: "text-c-warning dark:text-c-warning", dot: "bg-c-warning" },
    slate: { bg: "bg-c-snow dark:bg-c-gray-900/30", border: "border-c-gray-100 dark:border-c-gray-700", text: "text-c-gray-500 dark:text-c-gray-300", dot: "bg-c-gray-300" },
  }
  return (
    <div className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg p-4 bg-white dark:bg-c-gray-900">
      <div className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider mb-3">Next Actions</div>
      <div className="space-y-1.5">
        {actions.slice(0, 12).map((a, i) => {
          const c = colorMap[a.color] || colorMap.slate
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-md border ${c.bg} ${c.border}`}>
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
              <span className={`font-mono text-[10px] font-medium min-w-[36px] ${c.text}`}>{a.year}</span>
              <span className={`text-xs font-medium ${c.text}`}>{a.label}</span>
              <span className={`text-[10px] ${c.text} opacity-70 ml-auto`}>{a.detail}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Freeze Codes Panel ───
function FreezeCodesPanel({ rawYears }: { rawYears: Record<string, any> }) {
  const allFreezes = useMemo(() => {
    const results: { year: string; freezeCode: string; details: FreezeCode; triggeredBy: string }[] = []
    for (const [year, data] of Object.entries(rawYears)) {
      const transactions = data?.account?.transactions || []
      const detected = detectFreezeCodesInTranscript(transactions)
      for (const d of detected) {
        results.push({ year, ...d })
      }
    }
    return results
  }, [rawYears])

  if (allFreezes.length === 0) return null

  return (
    <details className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg bg-white dark:bg-c-gray-900 mb-5">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg">
        <span className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">Freeze Codes Detected</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger">
          {allFreezes.length}
        </span>
      </summary>
      <div className="px-4 pb-4 border-t border-c-gray-100 dark:border-c-gray-900 space-y-3 mt-0">
        {allFreezes.map((f, i) => (
          <div key={i} className="border border-c-danger/20 dark:border-c-danger/30/50 rounded-md bg-c-danger-soft dark:bg-c-danger/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-medium text-c-danger dark:text-c-danger">{f.freezeCode}</span>
              <span className="text-sm font-medium text-c-danger dark:text-c-danger">{f.details.name}</span>
              <span className="ml-auto font-mono text-[10px] text-c-danger dark:text-c-danger">TY {f.year}</span>
            </div>
            <div className="text-xs text-c-gray-500 dark:text-c-gray-300 mb-2">{f.details.description}</div>
            <div className="text-[10px] text-c-gray-500 mb-1">
              <span className="font-medium">Triggered by:</span> {f.triggeredBy}
            </div>
            <div className="text-[10px] text-c-gray-500 mb-1">
              <span className="font-medium">Releases:</span> {f.details.releases.join(" | ")}
            </div>
            <div className="mt-2 px-2 py-1.5 bg-c-warning-soft dark:bg-c-warning/30 border border-c-warning/20 dark:border-c-warning/30/50 rounded text-[11px] text-c-warning dark:text-c-warning font-medium">
              Action: {f.details.practitionerAction}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

// ─── Anomaly Alerts Panel ───
function AnomalyAlertsPanel({ rawYears }: { rawYears: Record<string, any> }) {
  const anomalies = useMemo(() => detectAnomalies(rawYears), [rawYears])

  if (anomalies.length === 0) return null

  const severityStyles: Record<string, { bg: string; border: string; text: string; dot: string; badge: string }> = {
    critical: { bg: "bg-c-danger-soft dark:bg-c-danger/20", border: "border-c-danger/20 dark:border-c-danger/30/50", text: "text-c-danger dark:text-c-danger", dot: "bg-c-danger", badge: "bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger" },
    warning: { bg: "bg-c-warning-soft dark:bg-c-warning/20", border: "border-c-warning/20 dark:border-c-warning/30/50", text: "text-c-warning dark:text-c-warning", dot: "bg-c-warning", badge: "bg-c-warning-soft dark:bg-c-warning/10 text-c-warning dark:text-c-warning" },
    info: { bg: "bg-c-info-soft dark:bg-c-teal/20", border: "border-c-teal/20 dark:border-c-teal/30/50", text: "text-c-teal dark:text-c-teal", dot: "bg-c-teal", badge: "bg-c-info-soft dark:bg-c-info/10 text-c-teal dark:text-c-teal" },
  }

  const critCount = anomalies.filter(a => a.severity === "critical").length

  return (
    <details className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg bg-white dark:bg-c-gray-900 mb-5" open={critCount > 0}>
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg">
        <span className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">Anomaly Alerts</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${critCount > 0 ? "bg-c-danger-soft dark:bg-c-danger/10 text-c-danger dark:text-c-danger" : "bg-c-warning-soft dark:bg-c-warning/10 text-c-warning dark:text-c-warning"}`}>
          {anomalies.length}
        </span>
      </summary>
      <div className="px-4 pb-4 border-t border-c-gray-100 dark:border-c-gray-900 space-y-2 mt-0">
        {anomalies.map((a) => {
          const s = severityStyles[a.severity] || severityStyles.info
          return (
            <div key={a.id} className={`border ${s.border} rounded-md ${s.bg} p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${s.badge}`}>{a.severity}</span>
                <span className={`text-xs font-medium ${s.text}`}>{a.type.replace(/_/g, " ")}</span>
                <span className="ml-auto font-mono text-[10px] text-c-gray-300">TY {a.taxYear}</span>
              </div>
              <div className={`text-xs font-medium ${s.text} mb-1`}>{a.description}</div>
              <div className="text-[11px] text-c-gray-500 dark:text-c-gray-300 mb-2">{a.details}</div>
              <div className="px-2 py-1.5 bg-white/60 dark:bg-c-gray-900/40 border border-c-gray-100 dark:border-c-gray-700 rounded text-[11px] text-c-gray-700 dark:text-c-gray-300">
                <span className="font-medium">Recommendation:</span> {a.recommendation}
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

// ─── Cross-Year Links Panel ───
function CrossYearLinksPanel({ rawYears }: { rawYears: Record<string, any> }) {
  const links = useMemo(() => detectCrossYearLinks(rawYears), [rawYears])

  if (links.length === 0) return null

  const typeStyles: Record<string, { bg: string; border: string; text: string }> = {
    OVERPAYMENT_TRANSFER: { bg: "bg-c-info-soft dark:bg-c-teal/20", border: "border-c-teal/20 dark:border-c-teal/30/50", text: "text-c-teal dark:text-c-teal" },
    CREDIT_TRANSFERRED_IN: { bg: "bg-c-success-soft dark:bg-c-success/20", border: "border-c-success/20 dark:border-c-success/30/50", text: "text-c-success dark:text-c-success" },
    CREDIT_TRANSFERRED_OUT: { bg: "bg-c-warning-soft dark:bg-c-warning/20", border: "border-c-warning/20 dark:border-c-warning/30/50", text: "text-c-warning dark:text-c-warning" },
    ESCALATING_BALANCES: { bg: "bg-c-danger-soft dark:bg-c-danger/20", border: "border-c-danger/20 dark:border-c-danger/30/50", text: "text-c-danger dark:text-c-danger" },
  }

  return (
    <details className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg bg-white dark:bg-c-gray-900 mb-5">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-c-snow dark:hover:bg-c-gray-900/30 rounded-lg">
        <span className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">Cross-Year Links</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-c-info-soft dark:bg-c-info/10 text-c-teal dark:text-c-teal">
          {links.length}
        </span>
      </summary>
      <div className="px-4 pb-4 border-t border-c-gray-100 dark:border-c-gray-900 space-y-2 mt-0">
        {links.map((l) => {
          const s = typeStyles[l.type] || typeStyles.OVERPAYMENT_TRANSFER
          return (
            <div key={l.id} className={`border ${s.border} rounded-md ${s.bg} p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${s.text}`}>{l.type.replace(/_/g, " ")}</span>
                <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-c-gray-500">
                  <span className="font-medium">{l.sourceYear}</span>
                  <span>{"\u2192"}</span>
                  <span className="font-medium">{l.targetYear}</span>
                </span>
              </div>
              <div className={`text-xs ${s.text}`}>{l.description}</div>
              {l.sourceTransaction.code !== "pattern" && (
                <div className="mt-1.5 text-[10px] text-c-gray-300">
                  TC {l.sourceTransaction.code} on {l.sourceTransaction.date || "N/A"}
                  {l.targetTransaction && ` \u2194 TC ${l.targetTransaction.code} on ${l.targetTransaction.date || "N/A"}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}

// ─── Main Dashboard ───
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
  taxpayer, years, rawYears, getYearResults,
  globalEntityType, globalFilingStatus, globalAge65,
  setGlobalEntityType, setGlobalFilingStatus, setGlobalAge65,
  onSelectYear,
}: RCCDashboardProps) {
  const actions = useMemo(
    () => getNextActions(years, rawYears, getYearResults),
    [years, rawYears, getYearResults]
  )

  if (years.length === 0) {
    return (
      <div className="text-center py-16 text-c-gray-300">
        <p className="text-sm">No transcript data loaded. Upload transcripts to get started.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100 mb-4">Taxpayer Dashboard</h2>

      <SummaryStrip taxpayer={taxpayer} years={years} rawYears={rawYears} getYearResults={getYearResults} />

      <RCCAssumptions
        entityType={globalEntityType} filingStatus={globalFilingStatus} age65={globalAge65}
        onEntityType={setGlobalEntityType} onFilingStatus={setGlobalFilingStatus} onAge65={setGlobalAge65}
      />

      {/* Coverage + Actions side by side */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        <TranscriptCoverage years={years} rawYears={rawYears} />
        <NextActionsPanel actions={actions} />
      </div>

      {/* Freeze Codes + Anomalies + Cross-Year Links */}
      <FreezeCodesPanel rawYears={rawYears} />
      <AnomalyAlertsPanel rawYears={rawYears} />
      <CrossYearLinksPanel rawYears={rawYears} />

      {/* Disclaimer */}
      <div className="mb-4 px-3 py-2 bg-c-warning-soft dark:bg-c-warning/20 border border-c-warning/20 dark:border-c-warning/30/50 rounded-md text-[11px] text-c-warning dark:text-c-warning italic">
        All figures are estimates based on transcript data and assumed filing parameters. Does not account for all possible income sources, deductions, or credits. Professional return preparation recommended.
      </div>

      {/* Year Summary Table */}
      <div className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider mb-2">Year Summary</div>
      <div className="overflow-x-auto border border-c-gray-100 dark:border-c-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-c-gray-900 dark:bg-c-gray-900 text-white text-[11px] uppercase tracking-wider">
              {["Year", "Filed", "Gross", "AGI", "Taxable", "Tax", "W/H", "Due/(Refund)", "Conf."].map((h) => (
                <th key={h} className={`px-3 py-2.5 font-medium ${h === "Year" ? "text-left" : "text-center"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((yr, i) => {
              const res = getYearResults(yr)
              const acct = rawYears[yr]?.account
              const retFiled = acct?.return_filed || rawYears[yr]?.tax_return?.filed
              const conf = assessConfidence(rawYears[yr])
              return (
                <tr
                  key={yr}
                  className={`cursor-pointer transition-colors hover:bg-c-info-soft dark:hover:bg-c-teal/20 ${
                    i % 2 ? "bg-c-snow dark:bg-c-gray-900/30" : "bg-white dark:bg-c-gray-900"
                  }`}
                  onClick={() => onSelectYear(yr)}
                >
                  <td className="px-3 py-2.5 font-medium font-mono">{yr}</td>
                  <td className="px-3 py-2.5 text-center">
                    <FilingBadge filed={retFiled} present={rawYears[yr]?.account?.return_present} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.grossIncome)}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.agi)}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.taxableIncome)}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.taxLiability)}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{fmt(res.withholding)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono font-medium ${
                    res.balanceDue > 0 ? "text-c-danger" : res.balanceDue < 0 ? "text-c-success" : "text-c-gray-500"
                  }`}>
                    {res.balanceDue < 0 ? `(${fmt(Math.abs(res.balanceDue))})` : fmt(res.balanceDue)}
                  </td>
                  <td className="px-3 py-2.5 text-center"><ConfidenceBadge level={conf.level} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
