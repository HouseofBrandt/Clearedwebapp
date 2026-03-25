"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Loader2,
  FileBarChart,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react"

interface ReportData {
  generatedAt: string
  executiveSummary: {
    overallScore: number
    totalControls: number
    controlsByStatus: {
      compliant: number
      partiallyCompliant: number
      nonCompliant: number
      notAssessed: number
    }
    openIssueCount: number
    criticalIssueCount: number
    highIssueCount: number
  }
  controlMatrix: {
    tsc: string
    score: number
    total: number
    passing: number
    controls: any[]
  }[]
  evidenceIndex: {
    summary: { current: number; stale: number; expired: number; missing: number }
    controls: any[]
  }
  issueLog: { total: number; open: number; issues: any[] }
  trendAnalysis: { date: string; pass: number; fail: number; warning: number }[]
  readinessAssessment: {
    overall: string
    overallScore: number
    factors: { factor: string; score: number; status: string; detail: string }[]
  }
}

const READINESS_COLORS: Record<string, string> = {
  AUDIT_READY: "text-green-600",
  NEEDS_ATTENTION: "text-yellow-600",
  NOT_READY: "text-red-600",
}

const READINESS_LABELS: Record<string, string> = {
  AUDIT_READY: "Audit Ready",
  NEEDS_ATTENTION: "Needs Attention",
  NOT_READY: "Not Ready",
}

const FACTOR_STATUS_ICONS: Record<string, any> = {
  ready: CheckCircle2,
  needs_attention: AlertTriangle,
  not_ready: XCircle,
}

export function ReportsView() {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch("/api/compliance/report")
        if (res.ok) {
          setReport(await res.json())
        } else {
          setError("Failed to generate report")
        }
      } catch {
        setError("Failed to fetch report")
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [])

  const downloadReport = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `soc2-audit-readiness-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileBarChart className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{error || "No report data"}</p>
        </CardContent>
      </Card>
    )
  }

  const { executiveSummary, controlMatrix, evidenceIndex, issueLog, readinessAssessment } = report

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Generated: {new Date(report.generatedAt).toLocaleString()}
        </p>
        <Button variant="outline" onClick={downloadReport}>
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-4xl font-bold">{executiveSummary.overallScore}%</p>
              <p className="text-sm text-muted-foreground">Overall Score</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold">{executiveSummary.totalControls}</p>
              <p className="text-sm text-muted-foreground">Total Controls</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-red-600">{executiveSummary.criticalIssueCount}</p>
              <p className="text-sm text-muted-foreground">Critical Issues</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-orange-600">{executiveSummary.openIssueCount}</p>
              <p className="text-sm text-muted-foreground">Open Issues</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="p-3 rounded bg-green-50 dark:bg-green-950 text-center">
              <p className="text-lg font-semibold text-green-700 dark:text-green-300">{executiveSummary.controlsByStatus.compliant}</p>
              <p className="text-xs text-green-600">Compliant</p>
            </div>
            <div className="p-3 rounded bg-yellow-50 dark:bg-yellow-950 text-center">
              <p className="text-lg font-semibold text-yellow-700 dark:text-yellow-300">{executiveSummary.controlsByStatus.partiallyCompliant}</p>
              <p className="text-xs text-yellow-600">Partial</p>
            </div>
            <div className="p-3 rounded bg-red-50 dark:bg-red-950 text-center">
              <p className="text-lg font-semibold text-red-700 dark:text-red-300">{executiveSummary.controlsByStatus.nonCompliant}</p>
              <p className="text-xs text-red-600">Non-Compliant</p>
            </div>
            <div className="p-3 rounded bg-gray-50 dark:bg-gray-900 text-center">
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{executiveSummary.controlsByStatus.notAssessed}</p>
              <p className="text-xs text-gray-600">Not Assessed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control Matrix</CardTitle>
          <CardDescription>Compliance scores by Trust Services Criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {controlMatrix.map((tsc) => (
              <div key={tsc.tsc} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{tsc.tsc.replace("_", " ")}</span>
                  <span className="text-sm text-muted-foreground">{tsc.score}% ({Math.round(tsc.passing)}/{tsc.total} passing)</span>
                </div>
                <Progress value={tsc.score} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Evidence Collection Status</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 rounded bg-green-50 dark:bg-green-950 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{evidenceIndex.summary.current}</p>
              <p className="text-xs text-green-600">Current</p>
            </div>
            <div className="p-3 rounded bg-yellow-50 dark:bg-yellow-950 text-center">
              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{evidenceIndex.summary.stale}</p>
              <p className="text-xs text-yellow-600">Stale</p>
            </div>
            <div className="p-3 rounded bg-orange-50 dark:bg-orange-950 text-center">
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{evidenceIndex.summary.expired}</p>
              <p className="text-xs text-orange-600">Expired</p>
            </div>
            <div className="p-3 rounded bg-red-50 dark:bg-red-950 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{evidenceIndex.summary.missing}</p>
              <p className="text-xs text-red-600">Missing</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Readiness Assessment</CardTitle>
          <CardDescription>
            <span className={`font-semibold ${READINESS_COLORS[readinessAssessment.overall] || ""}`}>
              {READINESS_LABELS[readinessAssessment.overall] || readinessAssessment.overall}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {readinessAssessment.factors.map((factor) => {
              const Icon = FACTOR_STATUS_ICONS[factor.status] || AlertTriangle
              const colorClass = factor.status === "ready" ? "text-green-600" : factor.status === "needs_attention" ? "text-yellow-600" : "text-red-600"
              return (
                <div key={factor.factor} className="flex items-center gap-4 p-3 border rounded-lg">
                  <Icon className={`h-5 w-5 shrink-0 ${colorClass}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{factor.factor}</span>
                      <span className="text-sm font-bold">{factor.score}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{factor.detail}</p>
                    <Progress value={factor.score} className="mt-2 h-1.5" />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Issue Log Summary</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {issueLog.total} total issues tracked, {issueLog.open} currently open.{" "}
            {issueLog.total > 0 ? `Resolution rate: ${Math.round(((issueLog.total - issueLog.open) / issueLog.total) * 100)}%` : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
