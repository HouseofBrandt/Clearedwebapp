"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
} from "lucide-react"
import {
  type FilingStatusType,
  getFilingStatus,
  estimateSFRReduction,
} from "@/lib/tax/filing-status-checker"

// ── Types ──────────────────────────────────────────────────────────

interface LiabilityPeriod {
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

interface CaseData {
  id: string
  tabsNumber: string
  clientName: string
  caseType: string
  status: string
  allReturnsFiled: boolean
  liabilityPeriods: LiabilityPeriod[]
  practitionerName: string | null
}

interface ComplianceGapClientProps {
  cases: CaseData[]
}

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// FilingStatusType and getFilingStatus imported from @/lib/tax/filing-status-checker

function getComplianceLabel(filingStatus: FilingStatusType): string {
  switch (filingStatus) {
    case "filed": return "Compliant"
    case "sfr": return "SFR — Needs Superseding Return"
    case "unfiled": return "Non-Compliant — Filing Required"
  }
}

function getActionNeeded(filingStatus: FilingStatusType, taxYear: number): string {
  switch (filingStatus) {
    case "filed": return "None"
    case "sfr": return `Supersede SFR for TY ${taxYear}`
    case "unfiled": return `File TY ${taxYear} — unfiled, filing required`
  }
}

// Estimate days to compliance: ~5 business days per unfiled/SFR year
function estimateDaysToCompliance(unfiledCount: number, sfrCount: number): number {
  return (unfiledCount + sfrCount) * 5
}

// ── Component ──────────────────────────────────────────────────────

export function ComplianceGapClient({ cases }: ComplianceGapClientProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string>("")
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const [reportCopied, setReportCopied] = useState(false)

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  )

  // Analyze periods for the selected case
  const analysis = useMemo(() => {
    if (!selectedCase) return null

    const periods = selectedCase.liabilityPeriods.map((lp) => {
      const filingStatus = getFilingStatus(lp)
      return {
        ...lp,
        filingStatus,
        complianceLabel: getComplianceLabel(filingStatus),
        actionNeeded: getActionNeeded(filingStatus, lp.taxYear),
      }
    })

    const filed = periods.filter((p) => p.filingStatus === "filed")
    const unfiled = periods.filter((p) => p.filingStatus === "unfiled")
    const sfr = periods.filter((p) => p.filingStatus === "sfr")
    const estDays = estimateDaysToCompliance(unfiled.length, sfr.length)

    // Build prioritized action items
    const actions: { priority: number; label: string; type: FilingStatusType; year: number; potentialReduction?: number }[] = []
    for (const p of unfiled) {
      actions.push({
        priority: 1,
        label: `File TY ${p.taxYear} — unfiled, filing required`,
        type: "unfiled",
        year: p.taxYear,
      })
    }
    for (const p of sfr) {
      const potentialReduction = p.originalAssessment
        ? estimateSFRReduction(p.originalAssessment).potentialReduction
        : undefined
      actions.push({
        priority: 2,
        label: potentialReduction
          ? `Supersede SFR for TY ${p.taxYear} — potential ${formatCurrency(potentialReduction)} reduction`
          : `Supersede SFR for TY ${p.taxYear}`,
        type: "sfr",
        year: p.taxYear,
        potentialReduction,
      })
    }
    actions.sort((a, b) => a.priority - b.priority || a.year - b.year)

    const totalReduction = actions.reduce((sum, a) => sum + (a.potentialReduction ?? 0), 0)

    return { periods, filed, unfiled, sfr, estDays, actions, totalReduction }
  }, [selectedCase])

  return (
    <div className="space-y-6">
      {/* Case Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <FileSearch className="h-5 w-5 text-[#1B3A5C]" />
            <div className="flex-1 max-w-md">
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a case to analyze..." />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.tabsNumber} — {c.clientName}
                      {c.liabilityPeriods.length > 0 && (
                        <span className="text-muted-foreground ml-2">
                          ({c.liabilityPeriods.length} periods)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedCase && (
              <div className="text-sm text-muted-foreground">
                Assigned to: <span className="font-medium">{selectedCase.practitionerName || "Unassigned"}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedCase && (
        <div className="text-center py-16 text-muted-foreground">
          <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a case above to view its compliance gap analysis</p>
        </div>
      )}

      {selectedCase && analysis && (
        <>
          {/* Gap Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Years
                </p>
                <p className="text-2xl font-bold mt-1">{analysis.periods.length}</p>
              </CardContent>
            </Card>

            <Card className="border-red-200">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
                  Unfiled
                </p>
                <p className="text-2xl font-bold mt-1 text-red-700">{analysis.unfiled.length}</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                  SFR Years
                </p>
                <p className="text-2xl font-bold mt-1 text-amber-700">{analysis.sfr.length}</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                  Compliant
                </p>
                <p className="text-2xl font-bold mt-1 text-emerald-700">{analysis.filed.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Est. Reduction
                </p>
                <p className="text-2xl font-bold mt-1 text-blue-600">
                  {analysis.totalReduction > 0 ? formatCurrency(analysis.totalReduction) : "--"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Overview Grid */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                  Year-by-Year Compliance Overview
                </CardTitle>
                <button
                  onClick={() => {
                    const report =
                      `COMPLIANCE GAP ANALYSIS \u2014 ${selectedCase.clientName}\n` +
                      `Case: ${selectedCase.tabsNumber}\n` +
                      `Date: ${new Date().toLocaleDateString()}\n\n` +
                      analysis.periods
                        .map(
                          (p) =>
                            `TY ${p.taxYear}: ${p.filingStatus.toUpperCase()} \u2014 ${p.actionNeeded}`
                        )
                        .join("\n")
                    navigator.clipboard.writeText(report)
                    setReportCopied(true)
                    setTimeout(() => setReportCopied(false), 2000)
                  }}
                  className="text-xs px-3 py-1.5 rounded border hover:bg-slate-50 flex items-center gap-1"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {reportCopied ? "Copied!" : "Copy Report"}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {analysis.periods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No liability periods found for this case. Upload IRS transcripts or add periods manually.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Tax Year</TableHead>
                      <TableHead className="w-28">Filing Status</TableHead>
                      <TableHead>Assessment Date</TableHead>
                      <TableHead className="text-right">Original Assessment</TableHead>
                      <TableHead>SFR Indicator</TableHead>
                      <TableHead>Compliance Status</TableHead>
                      <TableHead>Action Needed</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.periods.map((p) => (
                      <>
                        <TableRow
                          key={p.id}
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                            expandedYear === p.taxYear ? "bg-muted/30" : ""
                          }`}
                          onClick={() =>
                            setExpandedYear(expandedYear === p.taxYear ? null : p.taxYear)
                          }
                        >
                          <TableCell className="font-semibold">{p.taxYear}</TableCell>
                          <TableCell>
                            <FilingStatusBadge status={p.filingStatus} />
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(p.assessmentDate)}</TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatCurrency(p.originalAssessment)}
                          </TableCell>
                          <TableCell>
                            {p.filingStatus === "sfr" ? (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                                SFR Detected
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{p.complianceLabel}</TableCell>
                          <TableCell className="text-sm">
                            {p.filingStatus === "unfiled" ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {p.actionNeeded}
                              </Badge>
                            ) : p.filingStatus === "sfr" ? (
                              <Badge variant="default" className="text-[10px]">
                                {p.actionNeeded}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.filingStatus === "sfr" && (
                              expandedYear === p.taxYear ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )
                            )}
                          </TableCell>
                        </TableRow>

                        {/* SFR Analysis Panel (expanded) */}
                        {expandedYear === p.taxYear && p.filingStatus === "sfr" && (
                          <TableRow key={`${p.id}-sfr`}>
                            <TableCell colSpan={8} className="bg-amber-50/50 border-l-4 border-l-amber-400 p-0">
                              <SfrAnalysisPanel period={p} />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Action Items */}
          {analysis.actions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                  Prioritized Action Items ({analysis.actions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.actions.map((action, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-md border bg-white hover:bg-muted/30 transition-colors"
                    >
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[#1B3A5C] text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      {action.type === "unfiled" ? (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      )}
                      <Badge
                        variant={action.type === "unfiled" ? "destructive" : "default"}
                        className="text-[10px] flex-shrink-0"
                      >
                        {action.type === "unfiled" ? "FILE" : "Supersede"}
                      </Badge>
                      <span className="text-sm font-medium flex-1">{action.label}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All compliant message */}
          {analysis.actions.length === 0 && analysis.periods.length > 0 && (
            <Card className="border-emerald-200">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-emerald-700">All Years Compliant</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No unfiled returns or SFR assessments detected for this case.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────

function FilingStatusBadge({ status }: { status: FilingStatusType }) {
  switch (status) {
    case "filed":
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Filed
        </Badge>
      )
    case "unfiled":
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Unfiled
        </Badge>
      )
    case "sfr":
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          SFR
        </Badge>
      )
  }
}

function SfrAnalysisPanel({ period }: { period: LiabilityPeriod & { filingStatus: FilingStatusType } }) {
  const sfrAssessment = period.originalAssessment ?? 0
  // Conservative estimate using extracted SFR business logic
  const { estimatedActual, potentialReduction: delta } = estimateSFRReduction(sfrAssessment)
  const penaltiesOnSfr = period.penalties ?? 0
  const interestOnSfr = period.interest ?? 0

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-semibold text-amber-800">
          SFR Analysis — Tax Year {period.taxYear}
        </h4>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">SFR Assessment</p>
          <p className="text-lg font-bold text-red-700 mt-0.5">{formatCurrency(sfrAssessment)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Est. Original Liability</p>
          <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatCurrency(estimatedActual)}</p>
          <p className="text-[10px] text-muted-foreground">Based on W&I data estimate</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Potential Reduction</p>
          <p className="text-lg font-bold text-[#1B3A5C] mt-0.5">{formatCurrency(delta)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Penalties + Interest</p>
          <p className="text-lg font-bold mt-0.5">{formatCurrency(penaltiesOnSfr + interestOnSfr)}</p>
        </div>
      </div>

      {delta > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
          <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              Superseding the SFR could reduce liability by {formatCurrency(delta)}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              The IRS SFR does not include deductions, credits, or proper filing status.
              Filing an original return for TY {period.taxYear} will supersede the SFR and likely
              result in a significantly lower assessed liability.
            </p>
          </div>
        </div>
      )}

      {period.csedDate && (
        <div className="text-xs text-muted-foreground">
          CSED: {formatDate(period.csedDate)}
        </div>
      )}
    </div>
  )
}
