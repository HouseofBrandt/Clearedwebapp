"use client"

import { useState, useCallback, useMemo } from "react"
import { estimateReturn, extractIncomeFromForms, type ReturnEstimate } from "@/lib/tax/engine"
import { RCCUpload } from "./rcc-upload"
import { RCCDashboard } from "./rcc-dashboard"
import { RCCYearDetail } from "./rcc-year-detail"
import { RCCFiling } from "./rcc-filing"
import { RCCAccounts } from "./rcc-accounts"
import { RCCExport } from "./rcc-export"
import { Upload, LayoutDashboard, Calculator, ClipboardCheck, Archive, FileOutput } from "lucide-react"

export type RCCView = "upload" | "dashboard" | "year" | "filing" | "accounts" | "export"

const VIEW_CONFIG: { key: RCCView; label: string; icon: any }[] = [
  { key: "upload", label: "Upload & Parse", icon: Upload },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "year", label: "Year Analysis", icon: Calculator },
  { key: "filing", label: "Filing Requirements", icon: ClipboardCheck },
  { key: "accounts", label: "Account Activity", icon: Archive },
  { key: "export", label: "Export", icon: FileOutput },
]

export interface TaxpayerInfo {
  name: string
  ssn_last4: string
  addresses?: string[]
  representative_payee?: string | null
}

export function ClearedRCC() {
  const [view, setView] = useState<RCCView>("upload")
  const [taxpayer, setTaxpayer] = useState<TaxpayerInfo | null>(null)
  const [rawYears, setRawYears] = useState<Record<string, any>>({})
  const [overrides, setOverrides] = useState<Record<string, any>>({})
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [globalEntityType, setGlobalEntityType] = useState("individual")
  const [globalFilingStatus, setGlobalFilingStatus] = useState("single")
  const [globalAge65, setGlobalAge65] = useState(true)

  const years = useMemo(() => Object.keys(rawYears).sort(), [rawYears])

  const getYearOverrides = useCallback(
    (yr: string) => ({
      filingStatus: globalFilingStatus,
      age65Plus: globalAge65,
      entityType: globalEntityType,
      ...(overrides[yr] || {}),
    }),
    [overrides, globalFilingStatus, globalAge65, globalEntityType]
  )

  const getYearIncome = useCallback(
    (yr: string) => {
      const yd = rawYears[yr]
      if (!yd?.wage_income?.forms) return {}
      return extractIncomeFromForms(yd.wage_income.forms)
    },
    [rawYears]
  )

  const getYearResults = useCallback(
    (yr: string): ReturnEstimate => {
      const income = getYearIncome(yr)
      const ov = getYearOverrides(yr)
      return estimateReturn({ year: parseInt(yr), income, overrides: ov })
    },
    [getYearIncome, getYearOverrides]
  )

  function updateOverride(yr: string, key: string, val: any) {
    setOverrides((prev) => ({ ...prev, [yr]: { ...(prev[yr] || {}), [key]: val } }))
  }

  function handleParseComplete(tp: TaxpayerInfo | null, yrs: Record<string, any>) {
    if (tp) setTaxpayer(tp)
    if (yrs) {
      setRawYears(yrs)
      const sortedYears = Object.keys(yrs).sort()
      if (sortedYears.length) setSelectedYear(sortedYears[sortedYears.length - 1])
    }
    setView("dashboard")
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className="w-56 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-display-md text-slate-900 dark:text-slate-100">
            Transcript Decoder
          </h1>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
            Calculator
          </div>
        </div>
        <div className="p-2 flex-1">
          {VIEW_CONFIG.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 mb-0.5 rounded-md text-sm transition-colors ${
                view === key
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        {taxpayer && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            <div className="text-slate-600 dark:text-slate-300 font-medium mb-1">{taxpayer.name}</div>
            <div>SSN: XXX-XX-{taxpayer.ssn_last4}</div>
            {taxpayer.representative_payee && (
              <div className="text-amber-500 mt-1">Rep Payee: {taxpayer.representative_payee}</div>
            )}
            {years.length > 0 && <div className="mt-1">{years.length} year(s) loaded</div>}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 max-w-5xl overflow-auto">
        {view === "upload" && (
          <RCCUpload onParseComplete={handleParseComplete} />
        )}
        {view === "dashboard" && (
          <RCCDashboard
            taxpayer={taxpayer}
            years={years}
            rawYears={rawYears}
            getYearResults={getYearResults}
            globalEntityType={globalEntityType}
            globalFilingStatus={globalFilingStatus}
            globalAge65={globalAge65}
            setGlobalEntityType={setGlobalEntityType}
            setGlobalFilingStatus={setGlobalFilingStatus}
            setGlobalAge65={setGlobalAge65}
            onSelectYear={(yr) => { setSelectedYear(yr); setView("year") }}
          />
        )}
        {view === "year" && (
          <RCCYearDetail
            selectedYear={selectedYear}
            years={years}
            rawYears={rawYears}
            getYearIncome={getYearIncome}
            getYearOverrides={getYearOverrides}
            getYearResults={getYearResults}
            updateOverride={updateOverride}
            onSelectYear={setSelectedYear}
          />
        )}
        {view === "filing" && (
          <RCCFiling
            years={years}
            rawYears={rawYears}
            getYearOverrides={getYearOverrides}
            getYearResults={getYearResults}
            globalEntityType={globalEntityType}
            globalFilingStatus={globalFilingStatus}
            globalAge65={globalAge65}
            setGlobalEntityType={setGlobalEntityType}
            setGlobalFilingStatus={setGlobalFilingStatus}
            setGlobalAge65={setGlobalAge65}
          />
        )}
        {view === "accounts" && (
          <RCCAccounts years={years} rawYears={rawYears} />
        )}
        {view === "export" && (
          <RCCExport
            taxpayer={taxpayer}
            years={years}
            rawYears={rawYears}
            getYearResults={getYearResults}
            getYearOverrides={getYearOverrides}
          />
        )}
      </div>
    </div>
  )
}
