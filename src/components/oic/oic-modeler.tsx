"use client"

import { useState, useMemo, useCallback } from "react"
import {
  DollarSign,
  TrendingUp,
  Building2,
  BarChart3,
  Info,
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  Scale,
  Download,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type FinancialData,
  type RCPResult,
  type RCPOptions,
  computeRCP,
} from "@/lib/tax/rcp-calculator"
import {
  type HousingTier,
  HOUSING_TIERS,
  getNationalStandardFoodClothing,
  getHouseholdHealthcare,
  getHousingStandard,
  getTransportationStandard,
  getHouseholdStandards,
  FUTURE_INCOME_LUMP_SUM_MONTHS,
  FUTURE_INCOME_PERIODIC_MONTHS,
} from "@/lib/tax/irs-standards"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function currencyFull(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Parse a number from string, defaulting to 0. */
function num(v: string): number {
  const n = parseFloat(v.replace(/[,$\s]/g, ""))
  return isNaN(n) ? 0 : n
}

// ---------------------------------------------------------------------------
// Default financial data
// ---------------------------------------------------------------------------

function emptyFinancialData(): FinancialData {
  return {
    wages: 0,
    selfEmployment: 0,
    socialSecurity: 0,
    pension: 0,
    rentalIncome: 0,
    otherIncome: 0,
    housing: 0,
    utilities: 0,
    transportation: 0,
    healthInsurance: 0,
    courtOrderedPayments: 0,
    childcare: 0,
    otherExpenses: 0,
    bankAccounts: 0,
    investments: 0,
    retirement: 0,
    realEstate: [],
    vehicles: [],
    otherAssets: 0,
    lifeInsurance: 0,
  }
}

// ---------------------------------------------------------------------------
// Saved scenario type
// ---------------------------------------------------------------------------

interface SavedScenario {
  name: string
  data: FinancialData
  options: RCPOptions
  result: RCPResult
  householdConfig: HouseholdConfig
}

interface HouseholdConfig {
  householdSize: number
  membersOver65: number
  housingTier: HousingTier
  numberOfCars: number
  totalLiability: number
}

// ---------------------------------------------------------------------------
// Tooltip helper
// ---------------------------------------------------------------------------

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-c-gray-300 hover:text-c-gray-500 cursor-help inline ml-1" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Currency Input
// ---------------------------------------------------------------------------

function CurrencyInput({
  label,
  value,
  onChange,
  tooltip,
  placeholder,
  "aria-label": ariaLabel,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  tooltip?: string
  placeholder?: string
  "aria-label"?: string
}) {
  const [focused, setFocused] = useState(false)
  const [display, setDisplay] = useState(value === 0 ? "" : value.toString())

  const handleFocus = () => {
    setFocused(true)
    setDisplay(value === 0 ? "" : value.toString())
  }

  const handleBlur = () => {
    setFocused(false)
    const parsed = num(display)
    onChange(parsed)
    setDisplay(parsed === 0 ? "" : parsed.toString())
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(e.target.value)
    const parsed = num(e.target.value)
    onChange(parsed)
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-c-gray-500 dark:text-c-gray-300 flex items-center">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-c-gray-300 text-sm">$</span>
        <Input
          type="text"
          inputMode="decimal"
          className="pl-6 h-9 text-sm font-mono tabular-nums"
          placeholder={placeholder || "0"}
          value={focused ? display : value === 0 ? "" : currency(value).replace("$", "")}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          aria-label={ariaLabel || label}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OICModeler() {
  // Financial data state
  const [data, setData] = useState<FinancialData>(emptyFinancialData)

  // RCP options (scenario toggles)
  const [options, setOptions] = useState<RCPOptions>({
    excludeRetirement: false,
    challengeVehicleEquity: false,
    incomeOverride: null,
    dissipatedAssets: new Set(),
  })

  // Household configuration
  const [household, setHousehold] = useState<HouseholdConfig>({
    householdSize: 1,
    membersOver65: 0,
    housingTier: "medium" as HousingTier,
    numberOfCars: 1,
    totalLiability: 0,
  })

  // Income reduction modeling
  const [incomeReductionEnabled, setIncomeReductionEnabled] = useState(false)
  const [incomeReductionAmount, setIncomeReductionAmount] = useState(0)

  // Scenarios
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [scenarioName, setScenarioName] = useState("")

  // IRS Standards panel
  const [standardsExpanded, setStandardsExpanded] = useState(false)

  // Compute RCP in real time
  const rcp = useMemo(() => {
    const opts: RCPOptions = {
      ...options,
      incomeOverride: incomeReductionEnabled ? incomeReductionAmount : null,
    }
    return computeRCP(data, opts)
  }, [data, options, incomeReductionEnabled, incomeReductionAmount])

  // IRS standards for current household
  const standards = useMemo(
    () =>
      getHouseholdStandards({
        householdSize: household.householdSize,
        membersOver65: household.membersOver65,
        housingTier: household.housingTier,
        numberOfCars: household.numberOfCars,
      }),
    [household]
  )

  // Update a single field in data
  const updateField = useCallback(
    <K extends keyof FinancialData>(key: K, value: FinancialData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  // Save current state as a scenario
  const saveScenario = () => {
    if (!scenarioName.trim()) return
    const scenario: SavedScenario = {
      name: scenarioName.trim(),
      data: { ...data, realEstate: [...data.realEstate], vehicles: [...data.vehicles] },
      options: { ...options, dissipatedAssets: new Set(options.dissipatedAssets) },
      result: rcp,
      householdConfig: { ...household },
    }
    setSavedScenarios((prev) => [...prev.slice(-2), scenario]) // keep max 3
    setScenarioName("")
  }

  const removeScenario = (idx: number) => {
    setSavedScenarios((prev) => prev.filter((_, i) => i !== idx))
  }

  // Apply IRS standards to expense fields
  const applyStandards = () => {
    setData((prev) => ({
      ...prev,
      housing: standards.housing,
      transportation: standards.transportationOwnership + standards.transportationOperating,
      healthInsurance: standards.healthcare,
    }))
  }

  // Liability comparison
  const isOfferViable = household.totalLiability > 0 && rcp.rcpLumpSum < household.totalLiability

  // Export state
  const [exporting, setExporting] = useState(false)

  const exportXlsx = async () => {
    setExporting(true)
    try {
      const payload = {
        income: {
          wages: data.wages,
          selfEmployment: data.selfEmployment,
          socialSecurity: data.socialSecurity,
          pension: data.pension,
          rentalIncome: data.rentalIncome,
          otherIncome: data.otherIncome,
        },
        expenses: {
          housing: data.housing,
          utilities: data.utilities,
          transportation: data.transportation,
          healthInsurance: data.healthInsurance,
          courtOrderedPayments: data.courtOrderedPayments,
          childcare: data.childcare,
          otherExpenses: data.otherExpenses,
        },
        irsStandards: {
          housing: standards.housing,
          utilities: 0,
          transportation: standards.transportationOwnership + standards.transportationOperating,
          healthInsurance: standards.healthcare,
          foodClothing: standards.foodClothing,
        },
        assets: {
          bankAccounts: data.bankAccounts,
          investments: data.investments,
          retirement: data.retirement,
          realEstate: data.realEstate,
          vehicles: data.vehicles,
          otherAssets: data.otherAssets,
          lifeInsurance: data.lifeInsurance,
        },
        householdConfig: household,
        rcp,
        options: {
          excludeRetirement: options.excludeRetirement,
          challengeVehicleEquity: options.challengeVehicleEquity,
        },
      }

      const res = await fetch("/api/oic/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }))
        throw new Error(err.error || "Export failed")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const dateStr = new Date().toISOString().split("T")[0]
      a.download = `433-A_Worksheet_${dateStr}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Export failed:", err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* ── Left Sidebar ──────────────────────────────────────────── */}
        <div className="w-56 border-r border-c-gray-100 dark:border-c-gray-900 bg-c-snow dark:bg-c-gray-900/50 flex flex-col">
          <div className="px-4 py-4 border-b border-c-gray-100 dark:border-c-gray-900">
            <h1 className="text-display-md text-c-gray-900 dark:text-c-gray-100">
              OIC Modeler
            </h1>
            <div className="text-[10px] text-c-gray-300 uppercase tracking-widest mt-0.5">
              Offer in Compromise
            </div>
          </div>

          {/* Household Config */}
          <div className="p-4 space-y-3 border-b border-c-gray-100 dark:border-c-gray-900">
            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider">
              Household
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-c-gray-500">Size</Label>
              <Select
                value={household.householdSize.toString()}
                onValueChange={(v) =>
                  setHousehold((h) => ({ ...h, householdSize: parseInt(v) }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} {n === 1 ? "person" : "persons"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-c-gray-500">Members 65+</Label>
              <Select
                value={household.membersOver65.toString()}
                onValueChange={(v) =>
                  setHousehold((h) => ({ ...h, membersOver65: parseInt(v) }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: household.householdSize + 1 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-c-gray-500">Housing Tier</Label>
              <Select
                value={household.housingTier}
                onValueChange={(v) =>
                  setHousehold((h) => ({ ...h, housingTier: v as HousingTier }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSING_TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-c-gray-500">Vehicles</Label>
              <Select
                value={household.numberOfCars.toString()}
                onValueChange={(v) =>
                  setHousehold((h) => ({ ...h, numberOfCars: parseInt(v) }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} {n === 1 ? "car" : "cars"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Total Liability */}
          <div className="p-4 border-b border-c-gray-100 dark:border-c-gray-900">
            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider mb-2">
              Tax Liability
            </div>
            <CurrencyInput
              label="Total Assessed"
              value={household.totalLiability}
              onChange={(v) => setHousehold((h) => ({ ...h, totalLiability: v }))}
              tooltip="Total outstanding tax liability (all periods)"
            />
          </div>

          {/* Scenario Toggles */}
          <div className="p-4 space-y-3 flex-1">
            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider">
              Modeling Options
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-c-gray-500 dark:text-c-gray-300 flex items-center">
                Exclude Retirement
                <InfoTip text="Remove retirement accounts from asset equity. Common when taxpayer is near retirement age." />
              </Label>
              <Switch
                checked={options.excludeRetirement}
                onCheckedChange={(v) =>
                  setOptions((o) => ({ ...o, excludeRetirement: v }))
                }
                aria-label="Exclude retirement accounts from asset equity"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-c-gray-500 dark:text-c-gray-300 flex items-center">
                Challenge Vehicles
                <InfoTip text="Use 60% instead of 80% FMV for vehicle quick-sale value per IRM 5.8.5.4.1" />
              </Label>
              <Switch
                checked={options.challengeVehicleEquity}
                onCheckedChange={(v) =>
                  setOptions((o) => ({ ...o, challengeVehicleEquity: v }))
                }
                aria-label="Challenge vehicle equity valuation"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-c-gray-500 dark:text-c-gray-300 flex items-center">
                  Income Reduction
                  <InfoTip text="Model a reduced disposable income (e.g., job loss, medical leave)" />
                </Label>
                <Switch
                  checked={incomeReductionEnabled}
                  onCheckedChange={setIncomeReductionEnabled}
                  aria-label="Enable income reduction modeling"
                />
              </div>
              {incomeReductionEnabled && (
                <CurrencyInput
                  label="Monthly Disposable"
                  value={incomeReductionAmount}
                  onChange={setIncomeReductionAmount}
                  tooltip="Override the calculated monthly disposable income"
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Main Content ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            <div className="flex gap-6 max-w-[1400px]">
              {/* Left: Input forms */}
              <div className="flex-1 min-w-0">
                <Tabs defaultValue="income" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="income" className="text-xs">
                      <DollarSign className="h-3.5 w-3.5 mr-1" />
                      Income
                    </TabsTrigger>
                    <TabsTrigger value="expenses" className="text-xs">
                      <TrendingUp className="h-3.5 w-3.5 mr-1" />
                      Expenses
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="text-xs">
                      <Building2 className="h-3.5 w-3.5 mr-1" />
                      Assets
                    </TabsTrigger>
                    <TabsTrigger value="scenarios" className="text-xs">
                      <BarChart3 className="h-3.5 w-3.5 mr-1" />
                      Scenarios
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Tab 1: Income ──────────────────────────────── */}
                  <TabsContent value="income">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Monthly Income
                          <InfoTip text="Form 433-A, Section 4. Enter gross monthly income from all sources." />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <CurrencyInput
                          label="Wages / Salary"
                          value={data.wages}
                          onChange={(v) => updateField("wages", v)}
                          tooltip="Gross monthly wages before deductions (Form 433-A, Line 24)"
                        />
                        <CurrencyInput
                          label="Self-Employment Income"
                          value={data.selfEmployment}
                          onChange={(v) => updateField("selfEmployment", v)}
                          tooltip="Net monthly self-employment income (Form 433-A, Line 25)"
                        />
                        <CurrencyInput
                          label="Social Security"
                          value={data.socialSecurity}
                          onChange={(v) => updateField("socialSecurity", v)}
                          tooltip="Monthly Social Security benefits"
                        />
                        <CurrencyInput
                          label="Pension / Annuity"
                          value={data.pension}
                          onChange={(v) => updateField("pension", v)}
                          tooltip="Monthly pension or annuity income"
                        />
                        <CurrencyInput
                          label="Rental Income"
                          value={data.rentalIncome}
                          onChange={(v) => updateField("rentalIncome", v)}
                          tooltip="Net monthly rental income"
                        />
                        <CurrencyInput
                          label="Other Income"
                          value={data.otherIncome}
                          onChange={(v) => updateField("otherIncome", v)}
                          tooltip="Alimony, interest, dividends, or other monthly income"
                        />

                        <div className="col-span-2 pt-2 border-t border-c-gray-100 dark:border-c-gray-900">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-c-gray-700 dark:text-c-gray-300">
                              Total Monthly Income
                            </span>
                            <span className="text-lg font-medium text-c-gray-900 dark:text-c-gray-100 font-mono tabular-nums">
                              {currency(rcp.monthlyIncome)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Tab 2: Expenses ────────────────────────────── */}
                  <TabsContent value="expenses">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            Monthly Allowable Expenses
                            <InfoTip text="Form 433-A, Section 5. Expenses are capped at IRS Collection Financial Standards unless actual is lower." />
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={applyStandards}
                            className="text-xs h-7"
                          >
                            Apply IRS Standards
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <CurrencyInput
                            label="Housing (Rent/Mortgage)"
                            value={data.housing}
                            onChange={(v) => updateField("housing", v)}
                            tooltip={`IRS Local Standard: ${currency(standards.housing)}/mo for ${household.householdSize} person(s), ${household.housingTier} cost area`}
                          />
                          <CurrencyInput
                            label="Utilities"
                            value={data.utilities}
                            onChange={(v) => updateField("utilities", v)}
                            tooltip="Included in housing standard but may be entered separately if actual is claimed"
                          />
                          <CurrencyInput
                            label="Transportation"
                            value={data.transportation}
                            onChange={(v) => updateField("transportation", v)}
                            tooltip={`IRS Standard: Ownership ${currency(
                              getTransportationStandard(household.numberOfCars).ownership
                            )} + Operating ${currency(
                              getTransportationStandard(household.numberOfCars).operating
                            )} = ${currency(
                              getTransportationStandard(household.numberOfCars).total
                            )}/mo`}
                          />
                          <CurrencyInput
                            label="Health Insurance / Out-of-Pocket"
                            value={data.healthInsurance}
                            onChange={(v) => updateField("healthInsurance", v)}
                            tooltip={`IRS National Standard: ${currency(standards.healthcare)}/mo for household`}
                          />
                          <CurrencyInput
                            label="Court-Ordered Payments"
                            value={data.courtOrderedPayments}
                            onChange={(v) => updateField("courtOrderedPayments", v)}
                            tooltip="Child support, alimony, or other court-ordered obligations"
                          />
                          <CurrencyInput
                            label="Childcare / Dependent Care"
                            value={data.childcare}
                            onChange={(v) => updateField("childcare", v)}
                            tooltip="Necessary childcare expenses for employment"
                          />
                          <CurrencyInput
                            label="Other Necessary Expenses"
                            value={data.otherExpenses}
                            onChange={(v) => updateField("otherExpenses", v)}
                            tooltip="Other expenses allowable under IRS standards (e.g., student loan minimum, tax payments)"
                          />
                        </div>

                        <div className="pt-2 border-t border-c-gray-100 dark:border-c-gray-900">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-c-gray-700 dark:text-c-gray-300">
                              Total Allowable Expenses
                            </span>
                            <span className="text-lg font-medium text-c-gray-900 dark:text-c-gray-100 font-mono tabular-nums">
                              {currency(rcp.allowableExpenses)}
                            </span>
                          </div>
                        </div>

                        {/* IRS Standards Reference */}
                        <div className="border border-c-gray-100 dark:border-c-gray-700 rounded-lg">
                          <button
                            onClick={() => setStandardsExpanded(!standardsExpanded)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-c-gray-500 dark:text-c-gray-300 hover:bg-c-snow dark:hover:bg-c-gray-900/50 rounded-lg transition-colors"
                          >
                            <span>IRS Collection Financial Standards Reference</span>
                            {standardsExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {standardsExpanded && (
                            <div className="px-4 pb-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-md bg-c-snow dark:bg-c-gray-900/50 p-3">
                                  <div className="text-[10px] uppercase text-c-gray-300 tracking-wider mb-1">
                                    Food, Clothing & Misc
                                  </div>
                                  <div className="text-sm font-mono tabular-nums font-medium text-c-gray-700 dark:text-c-gray-300">
                                    {currency(standards.foodClothing)}/mo
                                  </div>
                                  <div className="text-[10px] text-c-gray-300 mt-0.5">
                                    National Standard, {household.householdSize} person(s)
                                  </div>
                                </div>
                                <div className="rounded-md bg-c-snow dark:bg-c-gray-900/50 p-3">
                                  <div className="text-[10px] uppercase text-c-gray-300 tracking-wider mb-1">
                                    Healthcare (OOP)
                                  </div>
                                  <div className="text-sm font-mono tabular-nums font-medium text-c-gray-700 dark:text-c-gray-300">
                                    {currency(standards.healthcare)}/mo
                                  </div>
                                  <div className="text-[10px] text-c-gray-300 mt-0.5">
                                    {household.membersOver65 > 0
                                      ? `${household.membersOver65} member(s) 65+`
                                      : "All under 65"}
                                  </div>
                                </div>
                                <div className="rounded-md bg-c-snow dark:bg-c-gray-900/50 p-3">
                                  <div className="text-[10px] uppercase text-c-gray-300 tracking-wider mb-1">
                                    Housing & Utilities
                                  </div>
                                  <div className="text-sm font-mono tabular-nums font-medium text-c-gray-700 dark:text-c-gray-300">
                                    {currency(standards.housing)}/mo
                                  </div>
                                  <div className="text-[10px] text-c-gray-300 mt-0.5">
                                    {HOUSING_TIERS.find((t) => t.value === household.housingTier)
                                      ?.label ?? ""}{" "}
                                    cost area
                                  </div>
                                </div>
                                <div className="rounded-md bg-c-snow dark:bg-c-gray-900/50 p-3">
                                  <div className="text-[10px] uppercase text-c-gray-300 tracking-wider mb-1">
                                    Transportation
                                  </div>
                                  <div className="text-sm font-mono tabular-nums font-medium text-c-gray-700 dark:text-c-gray-300">
                                    {currency(
                                      standards.transportationOwnership +
                                        standards.transportationOperating
                                    )}
                                    /mo
                                  </div>
                                  <div className="text-[10px] text-c-gray-300 mt-0.5">
                                    {household.numberOfCars} car(s): own{" "}
                                    {currency(standards.transportationOwnership)} + op{" "}
                                    {currency(standards.transportationOperating)}
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-md bg-navy-50 dark:bg-c-gray-900 border border-c-gray-100 dark:border-c-gray-700 p-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-medium text-c-gray-500 dark:text-c-gray-300">
                                    Total IRS Allowable
                                  </span>
                                  <span className="text-sm font-medium font-mono tabular-nums text-c-gray-900 dark:text-c-gray-100">
                                    {currency(standards.totalAllowable)}/mo
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Tab 3: Assets ──────────────────────────────── */}
                  <TabsContent value="assets">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Assets
                          <InfoTip text="Form 433-A, Sections 3 & 6. Quick sale value = FMV x 80% per IRM 5.8.5.4" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Liquid Assets */}
                        <div>
                          <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider mb-3">
                            Liquid Assets
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput
                              label="Bank Accounts"
                              value={data.bankAccounts}
                              onChange={(v) => updateField("bankAccounts", v)}
                              tooltip="Total of all checking and savings account balances (no QSV discount)"
                            />
                            <CurrencyInput
                              label="Investment Accounts"
                              value={data.investments}
                              onChange={(v) => updateField("investments", v)}
                              tooltip="Stocks, bonds, mutual funds — QSV = FMV x 80%"
                            />
                          </div>
                        </div>

                        {/* Retirement */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider">
                              Retirement Accounts
                              <InfoTip text="401(k), IRA, etc. Toggle 'Exclude Retirement' in sidebar to remove from RCP." />
                            </div>
                            {options.excludeRetirement && (
                              <span className="text-[10px] text-c-warning dark:text-c-warning bg-c-warning-soft dark:bg-c-warning/10 px-2 py-0.5 rounded-full font-medium">
                                EXCLUDED FROM RCP
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput
                              label="Total Retirement Balance"
                              value={data.retirement}
                              onChange={(v) => updateField("retirement", v)}
                              tooltip="Combined balance of all retirement accounts"
                            />
                          </div>
                        </div>

                        {/* Real Estate */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider">
                              Real Estate
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() =>
                                updateField("realEstate", [
                                  ...data.realEstate,
                                  { description: "", fmv: 0, loan: 0 },
                                ])
                              }
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Property
                            </Button>
                          </div>
                          {data.realEstate.length === 0 && (
                            <p className="text-xs text-c-gray-300 italic">
                              No real estate entered. Click &quot;Add Property&quot; above.
                            </p>
                          )}
                          {data.realEstate.map((prop, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end mb-3"
                            >
                              <div className="space-y-1">
                                <Label className="text-xs text-c-gray-500">Description</Label>
                                <Input
                                  className="h-9 text-sm"
                                  placeholder="Primary residence"
                                  value={prop.description || ""}
                                  onChange={(e) => {
                                    const updated = [...data.realEstate]
                                    updated[i] = { ...updated[i], description: e.target.value }
                                    updateField("realEstate", updated)
                                  }}
                                />
                              </div>
                              <CurrencyInput
                                label="Fair Market Value"
                                value={prop.fmv}
                                onChange={(v) => {
                                  const updated = [...data.realEstate]
                                  updated[i] = { ...updated[i], fmv: v }
                                  updateField("realEstate", updated)
                                }}
                                tooltip="Current fair market value"
                              />
                              <CurrencyInput
                                label="Loan Balance"
                                value={prop.loan}
                                onChange={(v) => {
                                  const updated = [...data.realEstate]
                                  updated[i] = { ...updated[i], loan: v }
                                  updateField("realEstate", updated)
                                }}
                                tooltip="Outstanding mortgage/lien balance"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 text-c-gray-300 hover:text-c-danger"
                                onClick={() =>
                                  updateField(
                                    "realEstate",
                                    data.realEstate.filter((_, idx) => idx !== i)
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Vehicles */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider">
                              Vehicles
                              {options.challengeVehicleEquity && (
                                <span className="ml-2 text-[10px] text-c-warning dark:text-c-warning bg-c-warning-soft dark:bg-c-warning/10 px-2 py-0.5 rounded-full font-medium normal-case">
                                  60% QSV APPLIED
                                </span>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() =>
                                updateField("vehicles", [
                                  ...data.vehicles,
                                  { description: "", fmv: 0, loan: 0 },
                                ])
                              }
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Vehicle
                            </Button>
                          </div>
                          {data.vehicles.length === 0 && (
                            <p className="text-xs text-c-gray-300 italic">
                              No vehicles entered. Click &quot;Add Vehicle&quot; above.
                            </p>
                          )}
                          {data.vehicles.map((v, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end mb-3"
                            >
                              <div className="space-y-1">
                                <Label className="text-xs text-c-gray-500">Description</Label>
                                <Input
                                  className="h-9 text-sm"
                                  placeholder="2020 Honda Civic"
                                  value={v.description || ""}
                                  onChange={(e) => {
                                    const updated = [...data.vehicles]
                                    updated[i] = { ...updated[i], description: e.target.value }
                                    updateField("vehicles", updated)
                                  }}
                                />
                              </div>
                              <CurrencyInput
                                label="Fair Market Value"
                                value={v.fmv}
                                onChange={(val) => {
                                  const updated = [...data.vehicles]
                                  updated[i] = { ...updated[i], fmv: val }
                                  updateField("vehicles", updated)
                                }}
                                tooltip="Current fair market value (KBB, NADA)"
                              />
                              <CurrencyInput
                                label="Loan Balance"
                                value={v.loan}
                                onChange={(val) => {
                                  const updated = [...data.vehicles]
                                  updated[i] = { ...updated[i], loan: val }
                                  updateField("vehicles", updated)
                                }}
                                tooltip="Outstanding auto loan balance"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 text-c-gray-300 hover:text-c-danger"
                                onClick={() =>
                                  updateField(
                                    "vehicles",
                                    data.vehicles.filter((_, idx) => idx !== i)
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Other Assets */}
                        <div>
                          <div className="text-xs font-medium text-c-gray-500 uppercase tracking-wider mb-3">
                            Other Assets
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput
                              label="Other Assets (FMV)"
                              value={data.otherAssets}
                              onChange={(v) => updateField("otherAssets", v)}
                              tooltip="Business equipment, collectibles, etc. — QSV = FMV x 80%"
                            />
                            <CurrencyInput
                              label="Life Insurance (CSV)"
                              value={data.lifeInsurance}
                              onChange={(v) => updateField("lifeInsurance", v)}
                              tooltip="Cash surrender value of whole life policies (full value, no QSV discount)"
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-c-gray-100 dark:border-c-gray-900">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-c-gray-700 dark:text-c-gray-300">
                              Total Net Asset Equity
                            </span>
                            <span className="text-lg font-medium text-c-gray-900 dark:text-c-gray-100 font-mono tabular-nums">
                              {currency(rcp.assetEquity)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Tab 4: Scenarios ───────────────────────────── */}
                  <TabsContent value="scenarios">
                    <div className="space-y-4">
                      {/* Save scenario */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Save & Compare Scenarios</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-2">
                            <Input
                              className="h-9 text-sm flex-1"
                              placeholder="Scenario name (e.g., 'Baseline', 'No Retirement')"
                              value={scenarioName}
                              onChange={(e) => setScenarioName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveScenario()}
                            />
                            <Button
                              size="sm"
                              className="h-9"
                              onClick={saveScenario}
                              disabled={!scenarioName.trim()}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" />
                              Save
                            </Button>
                          </div>
                          {savedScenarios.length >= 3 && (
                            <p className="text-[10px] text-c-gray-300 mt-1">
                              Maximum 3 scenarios. Oldest will be removed.
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Comparison table */}
                      {savedScenarios.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Scenario Comparison</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs w-[180px]">Metric</TableHead>
                                    <TableHead className="text-xs text-center bg-c-info-soft/50 dark:bg-c-info/10">
                                      Current
                                    </TableHead>
                                    {savedScenarios.map((s, i) => (
                                      <TableHead key={i} className="text-xs text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {s.name}
                                          <button
                                            onClick={() => removeScenario(i)}
                                            className="text-c-gray-300 hover:text-c-danger transition-colors"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {[
                                    {
                                      label: "Monthly Income",
                                      current: rcp.monthlyIncome,
                                      key: "monthlyIncome" as keyof RCPResult,
                                    },
                                    {
                                      label: "Allowable Expenses",
                                      current: rcp.allowableExpenses,
                                      key: "allowableExpenses" as keyof RCPResult,
                                    },
                                    {
                                      label: "Monthly Disposable",
                                      current: rcp.monthlyDisposable,
                                      key: "monthlyDisposable" as keyof RCPResult,
                                    },
                                    {
                                      label: `Future Income (${FUTURE_INCOME_LUMP_SUM_MONTHS}mo)`,
                                      current: rcp.futureIncomeLumpSum,
                                      key: "futureIncomeLumpSum" as keyof RCPResult,
                                    },
                                    {
                                      label: `Future Income (${FUTURE_INCOME_PERIODIC_MONTHS}mo)`,
                                      current: rcp.futureIncomePeriodic,
                                      key: "futureIncomePeriodic" as keyof RCPResult,
                                    },
                                    {
                                      label: "Asset Equity",
                                      current: rcp.assetEquity,
                                      key: "assetEquity" as keyof RCPResult,
                                    },
                                    {
                                      label: "RCP — Lump Sum",
                                      current: rcp.rcpLumpSum,
                                      key: "rcpLumpSum" as keyof RCPResult,
                                    },
                                    {
                                      label: "RCP — Periodic",
                                      current: rcp.rcpPeriodic,
                                      key: "rcpPeriodic" as keyof RCPResult,
                                    },
                                  ].map((row) => (
                                    <TableRow key={row.label}>
                                      <TableCell className="text-xs font-medium">
                                        {row.label}
                                      </TableCell>
                                      <TableCell className="text-xs text-center font-mono tabular-nums bg-c-info-soft/50 dark:bg-c-info/10">
                                        {currency(row.current)}
                                      </TableCell>
                                      {savedScenarios.map((s, i) => {
                                        const val = s.result[row.key] as number
                                        const delta = val - row.current
                                        return (
                                          <TableCell key={i} className="text-xs text-center font-mono tabular-nums">
                                            <div>{currency(val)}</div>
                                            {delta !== 0 && (
                                              <div
                                                className={`text-[10px] ${
                                                  delta < 0
                                                    ? "text-c-success dark:text-c-success"
                                                    : "text-c-danger"
                                                }`}
                                              >
                                                {delta > 0 ? "+" : ""}
                                                {currency(delta)}
                                              </div>
                                            )}
                                          </TableCell>
                                        )
                                      })}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {savedScenarios.length === 0 && (
                        <div className="text-center py-12 text-c-gray-300">
                          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No scenarios saved yet.</p>
                          <p className="text-xs mt-1">
                            Adjust inputs and toggles, then save a scenario to compare.
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* ── Right: Live RCP Panel ──────────────────────────── */}
              <div className="w-80 shrink-0">
                <div className="sticky top-6 space-y-4">
                  {/* Main RCP Card */}
                  <Card
                    className={`border-2 ${
                      isOfferViable
                        ? "border-c-success/30 dark:border-c-success/70"
                        : household.totalLiability > 0
                          ? "border-c-danger/30 dark:border-c-danger/70"
                          : "border-c-gray-100 dark:border-c-gray-700"
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Scale className="h-4 w-4 text-c-gray-500 dark:text-c-gray-300" />
                          <CardTitle className="text-sm">
                            Reasonable Collection Potential
                          </CardTitle>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportXlsx}
                          disabled={exporting}
                          className="text-xs h-7 px-2"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {exporting ? "Exporting..." : "Export .xlsx"}
                        </Button>
                      </div>
                      {household.totalLiability > 0 && (
                        <div
                          className={`text-xs font-medium mt-1 ${
                            isOfferViable
                              ? "text-c-success dark:text-c-success"
                              : "text-c-danger"
                          }`}
                        >
                          {isOfferViable
                            ? "OIC may be viable — RCP below liability"
                            : "RCP exceeds liability — OIC unlikely"}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Two-column: Lump Sum vs Periodic */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-c-snow dark:bg-c-gray-900/50 p-3 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-c-gray-300 mb-1">
                            Lump Sum
                          </div>
                          <div className="text-[10px] text-c-gray-300 mb-2">
                            (5 months to pay)
                          </div>
                          <div className="text-xl font-medium font-mono tabular-nums text-c-gray-900 dark:text-c-gray-100">
                            {currency(rcp.rcpLumpSum)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-c-snow dark:bg-c-gray-900/50 p-3 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-c-gray-300 mb-1">
                            Periodic
                          </div>
                          <div className="text-[10px] text-c-gray-300 mb-2">
                            (24 months to pay)
                          </div>
                          <div className="text-xl font-medium font-mono tabular-nums text-c-gray-900 dark:text-c-gray-100">
                            {currency(rcp.rcpPeriodic)}
                          </div>
                        </div>
                      </div>

                      {/* Liability comparison */}
                      {household.totalLiability > 0 && (
                        <div className="rounded-lg bg-c-snow dark:bg-c-gray-900/50 p-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-c-gray-500">Total Liability</span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(household.totalLiability)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-c-gray-500">Min. Offer (Lump Sum)</span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(rcp.rcpLumpSum)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs pt-1 border-t border-c-gray-100 dark:border-c-gray-700">
                            <span className="text-c-gray-500 font-medium">Potential Savings</span>
                            <span
                              className={`font-mono tabular-nums font-medium ${
                                household.totalLiability - rcp.rcpLumpSum > 0
                                  ? "text-c-success dark:text-c-success"
                                  : "text-c-danger"
                              }`}
                            >
                              {currency(household.totalLiability - rcp.rcpLumpSum)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Breakdown */}
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-c-gray-300">
                          Line Items
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-500">Monthly Income</span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(rcp.monthlyIncome)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-500">Allowable Expenses</span>
                            <span className="font-mono tabular-nums text-c-danger">
                              ({currency(rcp.allowableExpenses)})
                            </span>
                          </div>
                          <div className="flex justify-between text-xs border-t border-dashed border-c-gray-100 dark:border-c-gray-700 pt-1">
                            <span className="text-c-gray-500 dark:text-c-gray-300 font-medium">
                              Monthly Disposable
                            </span>
                            <span className="font-mono tabular-nums font-medium text-c-gray-900 dark:text-c-gray-200">
                              {currency(rcp.monthlyDisposable)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-500">
                              Future Income ({FUTURE_INCOME_LUMP_SUM_MONTHS}mo)
                            </span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(rcp.futureIncomeLumpSum)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-500">
                              Future Income ({FUTURE_INCOME_PERIODIC_MONTHS}mo)
                            </span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(rcp.futureIncomePeriodic)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-500">Asset Equity</span>
                            <span className="font-mono tabular-nums text-c-gray-700 dark:text-c-gray-300">
                              {currency(rcp.assetEquity)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-c-gray-100 dark:border-c-gray-700">
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-700 dark:text-c-gray-300 font-medium">
                              RCP (Lump Sum)
                            </span>
                            <span className="font-mono tabular-nums font-medium text-c-gray-900 dark:text-c-gray-100">
                              {currency(rcp.rcpLumpSum)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-c-gray-700 dark:text-c-gray-300 font-medium">
                              RCP (Periodic)
                            </span>
                            <span className="font-mono tabular-nums font-medium text-c-gray-900 dark:text-c-gray-100">
                              {currency(rcp.rcpPeriodic)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active toggles indicator */}
                  {(options.excludeRetirement ||
                    options.challengeVehicleEquity ||
                    incomeReductionEnabled) && (
                    <Card className="border-c-warning/20 dark:border-c-warning/80 bg-c-warning-soft/50 dark:bg-c-warning/10">
                      <CardContent className="py-3 space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-c-warning dark:text-c-warning font-medium">
                          Active Adjustments
                        </div>
                        {options.excludeRetirement && (
                          <div className="text-xs text-c-warning dark:text-c-warning">
                            Retirement accounts excluded
                          </div>
                        )}
                        {options.challengeVehicleEquity && (
                          <div className="text-xs text-c-warning dark:text-c-warning">
                            Vehicle equity challenged (60% QSV)
                          </div>
                        )}
                        {incomeReductionEnabled && (
                          <div className="text-xs text-c-warning dark:text-c-warning">
                            Income reduced to {currency(incomeReductionAmount)}/mo
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
