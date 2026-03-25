"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DollarSign,
  AlertTriangle,
  Calendar,
  FileCheck,
  Printer,
  ChevronDown,
  ChevronUp,
  Shield,
  TrendingDown,
  CreditCard,
  Loader2,
} from "lucide-react"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS, FILING_STATUS_LABELS } from "@/types"

interface IntelligenceReportData {
  clientName: string
  caseNumber: string
  caseType: string
  status: string
  assignedPractitioner: string | null
  filingStatus: string | null
  summary: {
    totalLiability: number
    totalPenalties: number
    totalInterest: number
    totalAssessed: number
    yearsAtIssue: number
    unfiledYears: number
    filedYears: number
    complianceRate: number
    docCompleteness: number
    documentCount: number
    aiTaskCount: number
  }
  liabilityTable: Array<{
    taxYear: number
    formType: string
    originalAssessment: number
    penalties: number
    interest: number
    totalBalance: number
    status: string | null
    assessmentDate: string | null
    csedDate: string | null
    daysToCSED: number | null
  }>
  csedAnalysis: Array<{
    taxYear: number
    csedDate: string | null
    daysRemaining: number | null
    status: string | null
  }>
  lienStatus: string
  roadmap: {
    oicViability: { score: number; label: string; factors: string[] }
    penaltyAbatement: { eligible: string[]; ineligible: string[]; totalPenalties: number }
    cncIndicators: { indicators: string[]; needsData: boolean }
    iaProjection: { monthlyPayment72: number; monthlyPayment84: number; streamlined: boolean }
  }
  deadlines: Array<{
    title: string
    dueDate: string
    daysRemaining: number
    priority: string
    type: string
  }>
  intelligence: {
    digest: string | null
    nextSteps: any
    riskScore: number | null
    confidenceScore: number | null
    resolutionPhase: string | null
  } | null
  generatedAt: string
}

function formatCurrency(n: number): string {
  return Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  })
}

function formatDate(date: string | null): string {
  if (!date) return "--"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function csedColorClass(days: number | null): string {
  if (days === null) return "text-muted-foreground"
  if (days < 365) return "text-red-600 font-semibold"
  if (days < 730) return "text-amber-600 font-medium"
  return "text-green-600"
}

function deadlinePriorityColor(priority: string): string {
  switch (priority) {
    case "CRITICAL": return "bg-red-100 text-red-800"
    case "HIGH": return "bg-orange-100 text-orange-800"
    case "MEDIUM": return "bg-yellow-100 text-yellow-800"
    case "LOW": return "bg-blue-100 text-blue-800"
    default: return "bg-gray-100 text-gray-800"
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600"
  if (score >= 40) return "text-amber-600"
  return "text-red-600"
}

function scoreProgressColor(score: number): string {
  if (score >= 70) return "[&>div]:bg-green-500"
  if (score >= 40) return "[&>div]:bg-amber-500"
  return "[&>div]:bg-red-500"
}

function statusBadgeColor(status: string | null): string {
  switch (status) {
    case "FILED":
    case "COMPLIANT":
      return "bg-green-100 text-green-800"
    case "UNFILED":
    case "SFR":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

export function CaseIntelligenceReport({ caseId }: { caseId: string }) {
  const [data, setData] = useState<IntelligenceReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oicExpanded, setOicExpanded] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchReport() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/cases/${caseId}/intelligence-report`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || "Failed to load report")
        }
        setData(await res.json())
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [caseId])

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Generating intelligence report...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-10 w-10 text-destructive/60" />
          <p className="mt-3 text-sm text-muted-foreground">{error || "No data available"}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { summary, roadmap, liabilityTable, deadlines, intelligence } = data

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .intelligence-report, .intelligence-report * { visibility: visible; }
          .intelligence-report { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>

      <div ref={reportRef} className="intelligence-report space-y-4 max-w-5xl">
        {/* Action buttons */}
        <div className="flex justify-end gap-2 no-print">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print / Save PDF
          </Button>
        </div>

        {/* Header */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Case Intelligence Report</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-sm font-medium">{data.caseNumber}</span>
                  <span className="text-sm text-muted-foreground">{data.clientName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {CASE_TYPE_LABELS[data.caseType as keyof typeof CASE_TYPE_LABELS] || data.caseType}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {CASE_STATUS_LABELS[data.status as keyof typeof CASE_STATUS_LABELS] || data.status}
                  </Badge>
                </div>
                {data.assignedPractitioner && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Practitioner: {data.assignedPractitioner}
                    {data.filingStatus && ` | Filing Status: ${FILING_STATUS_LABELS[data.filingStatus as keyof typeof FILING_STATUS_LABELS] || data.filingStatus}`}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">Generated</p>
                <p className="text-xs font-medium">{formatDate(data.generatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Liability</p>
              </div>
              <p className="text-lg font-bold mt-1">{formatCurrency(summary.totalLiability)}</p>
              <p className="text-[10px] text-muted-foreground">
                Penalties: {formatCurrency(summary.totalPenalties)} | Interest: {formatCurrency(summary.totalInterest)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Penalties</p>
              </div>
              <p className="text-lg font-bold mt-1">{formatCurrency(summary.totalPenalties)}</p>
              <p className="text-[10px] text-muted-foreground">
                {roadmap.penaltyAbatement.eligible.length} year(s) eligible for abatement
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Years at Issue</p>
              </div>
              <p className="text-lg font-bold mt-1">{summary.yearsAtIssue}</p>
              <p className="text-[10px] text-muted-foreground">
                {summary.filedYears} filed | {summary.unfiledYears} unfiled
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Compliance Rate</p>
              </div>
              <p className="text-lg font-bold mt-1">{summary.complianceRate}%</p>
              <Progress value={summary.complianceRate} className="h-1.5 mt-1" />
            </CardContent>
          </Card>
        </div>

        {/* Liability Table */}
        {liabilityTable.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Liability by Tax Year</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Year</TableHead>
                      <TableHead className="text-xs">Form</TableHead>
                      <TableHead className="text-xs text-right">Assessed</TableHead>
                      <TableHead className="text-xs text-right">Penalties</TableHead>
                      <TableHead className="text-xs text-right">Interest</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">CSED</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liabilityTable.map((row) => (
                      <TableRow key={`${row.taxYear}-${row.formType}`}>
                        <TableCell className="text-xs font-medium">{row.taxYear}</TableCell>
                        <TableCell className="text-xs">{row.formType}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(row.originalAssessment)}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(row.penalties)}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(row.interest)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{formatCurrency(row.totalBalance)}</TableCell>
                        <TableCell>
                          {row.status && (
                            <Badge variant="secondary" className={`text-[10px] ${statusBadgeColor(row.status)}`}>
                              {row.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.csedDate ? (
                            <span className={csedColorClass(row.daysToCSED)}>
                              {formatDate(row.csedDate)}
                              {row.daysToCSED !== null && (
                                <span className="block text-[10px]">
                                  {row.daysToCSED > 0 ? `${row.daysToCSED}d` : "Expired"}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resolution Roadmap */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Resolution Roadmap</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* OIC Viability */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-semibold">OIC Viability</p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${scoreColor(roadmap.oicViability.score)}`}>
                    {roadmap.oicViability.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${scoreColor(roadmap.oicViability.score)}`}>
                    {roadmap.oicViability.score}
                  </span>
                  <div className="flex-1">
                    <Progress
                      value={roadmap.oicViability.score}
                      className={`h-2 ${scoreProgressColor(roadmap.oicViability.score)}`}
                    />
                  </div>
                </div>
                {roadmap.oicViability.factors.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setOicExpanded(!oicExpanded)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground no-print"
                    >
                      {oicExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {roadmap.oicViability.factors.length} factor(s)
                    </button>
                    <ul className={`mt-1 space-y-0.5 ${oicExpanded ? "" : "hidden print:block"}`}>
                      {roadmap.oicViability.factors.map((f, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[6px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-muted-foreground/40">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Penalty Abatement */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">Penalty Abatement</p>
                </div>
                <p className="text-sm font-medium">
                  Abatable: {formatCurrency(roadmap.penaltyAbatement.totalPenalties)}
                </p>
                {roadmap.penaltyAbatement.eligible.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] font-medium text-green-700">Eligible:</p>
                    <ul className="space-y-0.5">
                      {roadmap.penaltyAbatement.eligible.map((e, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {roadmap.penaltyAbatement.ineligible.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] font-medium text-red-700">Not Eligible:</p>
                    <ul className="space-y-0.5">
                      {roadmap.penaltyAbatement.ineligible.map((e, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {roadmap.penaltyAbatement.eligible.length === 0 && roadmap.penaltyAbatement.ineligible.length === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">No penalty data available</p>
                )}
              </CardContent>
            </Card>

            {/* CNC Indicators */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">CNC Indicators</p>
                  {roadmap.cncIndicators.needsData && (
                    <Badge variant="outline" className="text-[9px]">Needs Data</Badge>
                  )}
                </div>
                {roadmap.cncIndicators.indicators.length > 0 ? (
                  <ul className="space-y-1">
                    {roadmap.cncIndicators.indicators.map((ind, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{ind}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No CNC indicators available</p>
                )}
              </CardContent>
            </Card>

            {/* IA Projection */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">Installment Agreement</p>
                  {roadmap.iaProjection.streamlined && (
                    <Badge variant="secondary" className="text-[9px] bg-green-100 text-green-800">Streamlined Eligible</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">72-Month Payment</p>
                    <p className="text-sm font-medium">{formatCurrency(roadmap.iaProjection.monthlyPayment72)}/mo</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">84-Month Payment</p>
                    <p className="text-sm font-medium">{formatCurrency(roadmap.iaProjection.monthlyPayment84)}/mo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        {deadlines.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-1.5">
                {deadlines.map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-[9px] ${deadlinePriorityColor(d.priority)}`}>
                        {d.priority}
                      </Badge>
                      <span className="text-xs">{d.title}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">{formatDate(d.dueDate)}</span>
                      <span className={`text-[10px] ml-2 ${
                        d.daysRemaining < 0 ? "text-red-600 font-semibold" :
                        d.daysRemaining < 7 ? "text-red-600" :
                        d.daysRemaining < 30 ? "text-amber-600" :
                        "text-green-600"
                      }`}>
                        {d.daysRemaining < 0 ? `${Math.abs(d.daysRemaining)}d overdue` : `${d.daysRemaining}d`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Intelligence Digest */}
        {intelligence?.digest && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                AI Case Digest
                {intelligence.riskScore !== null && (
                  <Badge variant="secondary" className={`text-[10px] ${
                    intelligence.riskScore >= 70 ? "bg-red-100 text-red-800" :
                    intelligence.riskScore >= 40 ? "bg-amber-100 text-amber-800" :
                    "bg-green-100 text-green-800"
                  }`}>
                    Risk: {intelligence.riskScore}
                  </Badge>
                )}
                {intelligence.confidenceScore !== null && (
                  <Badge variant="outline" className="text-[10px]">
                    Confidence: {intelligence.confidenceScore}%
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{intelligence.digest}</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground text-center py-2">
          Cleared Intelligence Report | {data.caseNumber} | Generated {formatDate(data.generatedAt)} | For internal practitioner use only — not for client distribution
        </p>
      </div>
    </>
  )
}
