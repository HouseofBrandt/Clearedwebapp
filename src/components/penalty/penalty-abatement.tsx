"use client"

import { useState, useMemo, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronRight, CheckCircle, Download } from "lucide-react"
import {
  PENALTY_TYPES,
  REASONABLE_CAUSE_CATEGORIES,
  type PenaltyTypeCode,
} from "@/lib/tax/penalty-reference"
import { checkFTAEligibility, type FTAInput, type FTAResult } from "@/lib/tax/fta-checker"
import {
  generateFTALetter,
  generateReasonableCauseLetter,
} from "@/lib/tax/penalty-letter"

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface SerializedLiabilityPeriod {
  id: string
  taxYear: number
  formType: string
  originalAssessment: number | null
  penalties: number | null
  interest: number | null
  totalBalance: number | null
  assessmentDate: string | null
  csedDate: string | null
  status: string | null
}

interface SerializedCase {
  id: string
  tabsNumber: string
  clientName: string
  caseType: string
  status: string
  allReturnsFiled: boolean
  currentOnEstimates: boolean
  practitionerName: string | null
  practitionerDesignation: string | null
  liabilityPeriods: SerializedLiabilityPeriod[]
}

interface PenaltyAbatementClientProps {
  cases: SerializedCase[]
}

type WorkflowStep = "select" | "fta" | "reasonable-cause" | "letter"

// ═══════════════════════════════════════════════════════════════
// HELPER: Infer penalty type from form type
// ═══════════════════════════════════════════════════════════════

function inferPenaltyType(formType: string): PenaltyTypeCode {
  const lower = formType.toLowerCase()
  if (lower.includes("941") || lower.includes("940") || lower.includes("944")) return "FTD"
  return "FTP" // default assumption for individual returns
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "$0.00"
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function PenaltyAbatementClient({ cases }: PenaltyAbatementClientProps) {
  // ─── State ───
  const [selectedCaseId, setSelectedCaseId] = useState<string>("")
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set())
  const [penaltyTypeOverrides, setPenaltyTypeOverrides] = useState<Record<string, PenaltyTypeCode>>({})
  const [ftaResult, setFtaResult] = useState<FTAResult | null>(null)
  const [step, setStep] = useState<WorkflowStep>("select")

  // Reasonable cause state
  const [reasonableCauseId, setReasonableCauseId] = useState<string>("")
  const [factualNarrative, setFactualNarrative] = useState<string>("")
  const [supportingDates, setSupportingDates] = useState<string>("")

  // FTA compliance inputs (for the 3 prior years)
  const [priorYearsFiled, setPriorYearsFiled] = useState<boolean[]>([true, true, true])
  const [priorYearsPenalties, setPriorYearsPenalties] = useState<boolean[]>([false, false, false])

  // Letter
  const [generatedLetter, setGeneratedLetter] = useState<string>("")
  const [copySuccess, setCopySuccess] = useState(false)
  const [letterJustGenerated, setLetterJustGenerated] = useState(false)
  const [docxExporting, setDocxExporting] = useState(false)

  // ─── Derived ───
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  )

  const periodsWithPenalties = useMemo(() => {
    if (!selectedCase) return []
    return selectedCase.liabilityPeriods.filter(
      (lp) => lp.penalties !== null && lp.penalties > 0
    )
  }, [selectedCase])

  const selectedPeriods = useMemo(
    () => periodsWithPenalties.filter((lp) => selectedPeriodIds.has(lp.id)),
    [periodsWithPenalties, selectedPeriodIds]
  )

  const totalPenaltiesSelected = useMemo(
    () => selectedPeriods.reduce((sum, lp) => sum + (lp.penalties ?? 0), 0),
    [selectedPeriods]
  )

  const getPenaltyType = useCallback(
    (lp: SerializedLiabilityPeriod): PenaltyTypeCode =>
      penaltyTypeOverrides[lp.id] ?? inferPenaltyType(lp.formType),
    [penaltyTypeOverrides]
  )

  const ftaEligibleAmount = useMemo(() => {
    return selectedPeriods
      .filter((lp) => PENALTY_TYPES[getPenaltyType(lp)]?.ftaEligible)
      .reduce((sum, lp) => sum + (lp.penalties ?? 0), 0)
  }, [selectedPeriods, getPenaltyType])

  const reasonableCauseAmount = useMemo(() => {
    return totalPenaltiesSelected - ftaEligibleAmount
  }, [totalPenaltiesSelected, ftaEligibleAmount])

  // ─── Handlers ───
  function handleCaseChange(caseId: string) {
    setSelectedCaseId(caseId)
    setSelectedPeriodIds(new Set())
    setPenaltyTypeOverrides({})
    setFtaResult(null)
    setStep("select")
    setGeneratedLetter("")
    setReasonableCauseId("")
    setFactualNarrative("")
    setSupportingDates("")
    setPriorYearsFiled([true, true, true])
    setPriorYearsPenalties([false, false, false])
  }

  function togglePeriod(periodId: string) {
    setSelectedPeriodIds((prev) => {
      const next = new Set(prev)
      if (next.has(periodId)) {
        next.delete(periodId)
      } else {
        next.add(periodId)
      }
      return next
    })
    setFtaResult(null)
    setStep("select")
    setGeneratedLetter("")
  }

  function toggleAllPeriods() {
    if (selectedPeriodIds.size === periodsWithPenalties.length) {
      setSelectedPeriodIds(new Set())
    } else {
      setSelectedPeriodIds(new Set(periodsWithPenalties.map((lp) => lp.id)))
    }
    setFtaResult(null)
    setStep("select")
    setGeneratedLetter("")
  }

  function handlePenaltyTypeChange(periodId: string, type: PenaltyTypeCode) {
    setPenaltyTypeOverrides((prev) => ({ ...prev, [periodId]: type }))
    setFtaResult(null)
    setGeneratedLetter("")
  }

  function runFTACheck() {
    if (selectedPeriods.length === 0) return

    // Use the first selected penalty for the FTA check
    const primary = selectedPeriods[0]
    const penaltyType = getPenaltyType(primary)

    const input: FTAInput = {
      taxYear: primary.taxYear,
      penaltyType,
      penaltyAmount: primary.penalties ?? 0,
      priorYearsFiled,
      priorYearsPenalties,
      currentlyCompliant: selectedCase?.allReturnsFiled ?? false,
    }

    const result = checkFTAEligibility(input)
    setFtaResult(result)
    setStep("fta")
  }

  function proceedToReasonableCause() {
    setStep("reasonable-cause")
  }

  function generateLetter() {
    if (!selectedCase || selectedPeriods.length === 0) return

    const penalties = selectedPeriods.map((lp) => ({
      penaltyType: getPenaltyType(lp),
      taxYear: lp.taxYear,
      penaltyAmount: lp.penalties ?? 0,
      formType: lp.formType,
    }))

    if (step === "fta" && ftaResult?.eligible) {
      const letter = generateFTALetter({
        taxpayerName: selectedCase.clientName,
        taxpayerTIN: "[On File]",
        tinType: "SSN",
        penalties,
        ftaResult,
        practitionerName: selectedCase.practitionerName ?? "[Practitioner Name]",
        practitionerDesignation: selectedCase.practitionerDesignation ?? undefined,
        firmName: "[Firm Name]",
      })
      setGeneratedLetter(letter)
      setStep("letter")
      setLetterJustGenerated(true)
      setTimeout(() => setLetterJustGenerated(false), 4000)
    } else {
      if (!reasonableCauseId || factualNarrative.length < 50) return
      const letter = generateReasonableCauseLetter({
        taxpayerName: selectedCase.clientName,
        taxpayerTIN: "[On File]",
        tinType: "SSN",
        penalties,
        reasonableCauseId,
        factualNarrative,
        supportingDates: supportingDates || undefined,
        practitionerName: selectedCase.practitionerName ?? "[Practitioner Name]",
        practitionerDesignation: selectedCase.practitionerDesignation ?? undefined,
        firmName: "[Firm Name]",
      })
      setGeneratedLetter(letter)
      setStep("letter")
      setLetterJustGenerated(true)
      setTimeout(() => setLetterJustGenerated(false), 4000)
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(generatedLetter)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement("textarea")
      textarea.value = generatedLetter
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  async function exportDocx() {
    if (!generatedLetter) return
    setDocxExporting(true)
    try {
      const letterType = ftaResult?.eligible ? "fta" : "reasonable-cause"
      const res = await fetch("/api/penalty/export-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterText: generatedLetter,
          letterType,
          taxpayerName: selectedCase?.clientName,
          taxYears: selectedPeriods.map((lp) => lp.taxYear),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }))
        throw new Error(err.error || "Export failed")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const typeLabel = letterType === "fta" ? "FTA" : "Reasonable_Cause"
      const dateStr = new Date().toISOString().split("T")[0]
      a.download = `Penalty_Abatement_${typeLabel}_${dateStr}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Export failed:", err)
    } finally {
      setDocxExporting(false)
    }
  }

  // ─── Render ───
  if (cases.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">
            No cases with assessed penalties found. Cases must have liability periods
            with penalty amounts greater than zero.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Summary Stats ─── */}
      {selectedPeriodIds.size > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Penalties Selected</div>
            <div className="text-xl font-medium mt-1 font-mono tabular-nums">{selectedPeriodIds.size}</div>
            <div className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
              {formatCurrency(totalPenaltiesSelected)}
            </div>
          </Card>
          <Card className="p-4 border-c-success/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">FTA Eligible</div>
            <div className="text-xl font-medium text-c-success mt-1 font-mono tabular-nums">{formatCurrency(ftaEligibleAmount)}</div>
          </Card>
          <Card className="p-4 border-c-warning/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Reasonable Cause</div>
            <div className="text-xl font-medium text-c-warning mt-1 font-mono tabular-nums">{formatCurrency(reasonableCauseAmount)}</div>
          </Card>
        </div>
      )}

      {/* ─── Workflow Step Indicator ─── */}
      {selectedCase && selectedPeriodIds.size > 0 && (
        <div className="flex items-center gap-2 mb-0 text-sm flex-wrap">
          {(["Select Penalties", "Check FTA", "Reasonable Cause", "Generate Letter"] as const).map((label, i) => {
            const stepMap: Record<WorkflowStep, number> = { "select": 0, "fta": 1, "reasonable-cause": 2, "letter": 3 }
            const currentStepIndex = stepMap[step] ?? 0
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  i <= currentStepIndex ? "bg-c-gray-900 text-white" : "bg-c-gray-100 text-c-gray-300"
                }`}>
                  {i + 1}
                </div>
                <span className={i <= currentStepIndex ? "text-c-gray-900 font-medium" : "text-c-gray-300"}>
                  {label}
                </span>
                {i < 3 && <ChevronRight className="h-4 w-4 text-c-gray-300" />}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Case Selector ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Case</CardTitle>
          <CardDescription>Choose a case with assessed penalties to evaluate for abatement</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedCaseId} onValueChange={handleCaseChange}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select a case..." />
            </SelectTrigger>
            <SelectContent>
              {cases.map((c) => {
                const totalPenalties = c.liabilityPeriods
                  .filter((lp) => lp.penalties !== null && lp.penalties > 0)
                  .reduce((sum, lp) => sum + (lp.penalties ?? 0), 0)
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {c.tabsNumber} - {c.clientName} ({formatCurrency(totalPenalties)} in penalties)
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* ─── Penalty Selection Table ─── */}
      {selectedCase && periodsWithPenalties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Penalties for {selectedCase.clientName}</CardTitle>
            <CardDescription>
              Select penalties to evaluate for abatement. Assign the correct penalty type for each period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedPeriodIds.size === periodsWithPenalties.length && periodsWithPenalties.length > 0}
                      onChange={toggleAllPeriods}
                      className="h-4 w-4 rounded border-c-gray-200"
                      aria-label="Select all penalties"
                    />
                  </TableHead>
                  <TableHead>Tax Year</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Penalty Type</TableHead>
                  <TableHead>IRC Section</TableHead>
                  <TableHead className="text-right">Penalty Amount</TableHead>
                  <TableHead>FTA Eligible</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodsWithPenalties.map((lp) => {
                  const penaltyType = getPenaltyType(lp)
                  const info = PENALTY_TYPES[penaltyType]
                  return (
                    <TableRow key={lp.id} data-state={selectedPeriodIds.has(lp.id) ? "selected" : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedPeriodIds.has(lp.id)}
                          onChange={() => togglePeriod(lp.id)}
                          className="h-4 w-4 rounded border-c-gray-200"
                          aria-label={`Select penalty for tax year ${lp.taxYear}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lp.taxYear}</TableCell>
                      <TableCell>{lp.formType}</TableCell>
                      <TableCell>
                        <select
                          value={penaltyType}
                          onChange={(e) => handlePenaltyTypeChange(lp.id, e.target.value as PenaltyTypeCode)}
                          className="text-sm border border-input rounded-md px-2 py-1 bg-background"
                          aria-label={`Penalty type for tax year ${lp.taxYear}`}
                        >
                          {Object.entries(PENALTY_TYPES).map(([code, pt]) => (
                            <option key={code} value={code}>
                              {pt.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-xs font-mono tabular-nums">{info.irc}</TableCell>
                      <TableCell className="text-right font-medium font-mono tabular-nums">
                        {formatCurrency(lp.penalties)}
                      </TableCell>
                      <TableCell>
                        {info.ftaEligible ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {lp.status ?? "Assessed"}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Action buttons */}
            {selectedPeriods.length > 0 && (
              <div className="flex gap-3 mt-6">
                <Button onClick={runFTACheck}>
                  Run FTA Eligibility Check
                </Button>
                <Button variant="outline" onClick={proceedToReasonableCause}>
                  Skip to Reasonable Cause
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── FTA Compliance Inputs ─── */}
      {selectedCase && selectedPeriods.length > 0 && step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance History (for FTA Check)</CardTitle>
            <CardDescription>
              Confirm the taxpayer&apos;s compliance history for the 3 years prior to tax year{" "}
              {selectedPeriods[0]?.taxYear}. This information drives the FTA eligibility determination.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[0, 1, 2].map((idx) => {
                const year = (selectedPeriods[0]?.taxYear ?? 2023) - (idx + 1)
                return (
                  <div key={idx} className="flex items-center gap-6 py-2 border-b last:border-0">
                    <span className="font-medium w-20">TY {year}</span>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={priorYearsFiled[idx]}
                        onChange={(e) => {
                          const next = [...priorYearsFiled]
                          next[idx] = e.target.checked
                          setPriorYearsFiled(next)
                        }}
                        className="h-4 w-4 rounded border-c-gray-200"
                        aria-label={`Return filed for tax year ${year}`}
                      />
                      Return filed
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={priorYearsPenalties[idx]}
                        onChange={(e) => {
                          const next = [...priorYearsPenalties]
                          next[idx] = e.target.checked
                          setPriorYearsPenalties(next)
                        }}
                        className="h-4 w-4 rounded border-c-gray-200"
                        aria-label={`Penalty assessed for tax year ${year}`}
                      />
                      Penalty assessed
                    </label>
                  </div>
                )
              })}
              <div className="flex items-center gap-2 text-sm pt-2">
                <span className="text-muted-foreground">
                  Currently compliant (all returns filed):
                </span>
                <Badge
                  className={
                    selectedCase.allReturnsFiled
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                      : "bg-c-danger-soft text-c-danger border-c-danger/20 hover:bg-c-danger-soft"
                  }
                >
                  {selectedCase.allReturnsFiled ? "Yes" : "No"}
                </Badge>
                <span className="text-xs text-muted-foreground ml-2">
                  (from Case Intelligence)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── FTA Result ─── */}
      {ftaResult && step === "fta" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">FTA Eligibility Result</CardTitle>
                <CardDescription>{ftaResult.irmCitation}</CardDescription>
              </div>
              <Badge
                className={
                  ftaResult.eligible
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-base px-4 py-1"
                    : "bg-c-danger-soft text-c-danger border-c-danger/20 hover:bg-c-danger-soft text-base px-4 py-1"
                }
              >
                {ftaResult.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{ftaResult.reason}</p>

            {/* Factor breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Factor-by-Factor Analysis
              </h4>
              {ftaResult.factors.map((factor, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-4 ${
                    factor.met
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-c-danger/20 bg-c-danger-soft/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-lg ${factor.met ? "text-emerald-600" : "text-c-danger"}`}>
                      {factor.met ? "\u2713" : "\u2717"}
                    </span>
                    <span className="font-medium text-sm">{factor.factor}</span>
                  </div>
                  <p className="text-sm text-muted-foreground ml-7">{factor.detail}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {ftaResult.eligible ? (
                <Button onClick={generateLetter}>
                  Generate FTA Letter
                </Button>
              ) : (
                <>
                  <Button onClick={proceedToReasonableCause}>
                    Proceed to Reasonable Cause
                  </Button>
                  <Button variant="outline" onClick={() => { setStep("select"); setFtaResult(null) }}>
                    Adjust Inputs & Re-Check
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Reasonable Cause Workflow ─── */}
      {step === "reasonable-cause" && selectedPeriods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reasonable Cause Abatement</CardTitle>
            <CardDescription>
              Build a reasonable cause argument under IRM 20.1.1.3.2. Select the applicable
              category and provide the factual narrative.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Category selector */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Reasonable Cause Category</h4>
              <div className="space-y-2">
                {REASONABLE_CAUSE_CATEGORIES.map((cat) => (
                  <label
                    key={cat.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      reasonableCauseId === cat.id
                        ? "border-c-teal/20 bg-c-info-soft/50"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reasonableCause"
                      value={cat.id}
                      checked={reasonableCauseId === cat.id}
                      onChange={(e) => setReasonableCauseId(e.target.value)}
                      className="mt-1 h-4 w-4"
                      aria-label={`Select reasonable cause: ${cat.label}`}
                    />
                    <div>
                      <span className="font-medium text-sm">{cat.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">
                        {cat.irmRef}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Factual narrative */}
            {reasonableCauseId && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium">Factual Narrative</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Describe the specific facts and circumstances that constitute reasonable cause.
                    This section will appear in the letter as practitioner input. Minimum 50 characters
                    recommended; 200+ characters for a strong argument.
                  </p>
                </div>
                <Textarea
                  value={factualNarrative}
                  onChange={(e) => setFactualNarrative(e.target.value)}
                  placeholder="Describe the facts and circumstances that prevented the taxpayer from filing/paying on time..."
                  className="min-h-[160px]"
                />
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      factualNarrative.length >= 200
                        ? "text-emerald-600"
                        : factualNarrative.length >= 50
                        ? "text-c-warning"
                        : "text-c-danger"
                    }`}
                  >
                    {factualNarrative.length} characters
                    {factualNarrative.length < 50 && " (minimum 50 required)"}
                    {factualNarrative.length >= 50 && factualNarrative.length < 200 && " (200+ recommended)"}
                  </span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Supporting Dates (optional)</h4>
                  <Textarea
                    value={supportingDates}
                    onChange={(e) => setSupportingDates(e.target.value)}
                    placeholder="e.g., Hospitalized March 1 - April 15, 2023; Discharged April 16, 2023; Filed return May 1, 2023"
                    className="min-h-[60px]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={generateLetter}
                    disabled={factualNarrative.length < 50 || !reasonableCauseId}
                  >
                    Generate Reasonable Cause Letter
                  </Button>
                  <Button variant="outline" onClick={() => setStep("select")}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Letter Preview ─── */}
      {step === "letter" && generatedLetter && (
        <Card>
          {letterJustGenerated && (
            <div className="mx-6 mt-6 p-3 rounded-md bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              Letter generated successfully. Review the content below before copying or exporting.
            </div>
          )}
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Letter Preview</CardTitle>
                <CardDescription>
                  Review the generated letter. Sections marked [AUTO-GENERATED] are template text;
                  sections marked [PRACTITIONER INPUT] contain your narrative.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={copyToClipboard}
                >
                  {copySuccess ? "Copied!" : "Copy to Clipboard"}
                </Button>
                <Button
                  variant="outline"
                  onClick={exportDocx}
                  disabled={docxExporting}
                >
                  <Download className="h-4 w-4 mr-1" />
                  {docxExporting ? "Exporting..." : "Export .docx"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(ftaResult?.eligible ? "fta" : "reasonable-cause")
                    setGeneratedLetter("")
                  }}
                >
                  Edit Inputs
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Letter content rendered as formatted text */}
            <div className="rounded-lg border bg-white p-8 max-h-[700px] overflow-y-auto">
              <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-c-gray-900">
                {generatedLetter}
              </pre>
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-c-info-soft border border-c-teal/20" />
                [AUTO-GENERATED] = Template text (review for accuracy)
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-c-warning-soft border border-c-warning/20" />
                [PRACTITIONER INPUT] = Your factual narrative
              </div>
            </div>

            {/* Send to review */}
            <div className="flex gap-3 mt-6">
              <Button onClick={copyToClipboard}>
                {copySuccess ? "Copied!" : "Copy to Clipboard"}
              </Button>
              <Button variant="outline" onClick={() => setStep("select")}>
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Penalty Reference (always visible at bottom) ─── */}
      {selectedCase && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Penalty Reference Guide</CardTitle>
            <CardDescription>
              IRC sections, penalty rates, and IRM abatement references
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Penalty</TableHead>
                  <TableHead>IRC Section</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>FTA Eligible</TableHead>
                  <TableHead>IRM Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(PENALTY_TYPES).map(([code, info]) => (
                  <TableRow key={code}>
                    <TableCell className="font-medium">{info.name}</TableCell>
                    <TableCell className="font-mono text-xs">{info.irc}</TableCell>
                    <TableCell className="text-sm">{info.rate}</TableCell>
                    <TableCell>
                      {info.ftaEligible ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{info.irmAbatement}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
