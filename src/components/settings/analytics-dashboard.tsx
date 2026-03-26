"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { BarChart3, CheckCircle, Clock, BookOpen, RefreshCw } from "lucide-react"

const TASK_TYPE_LABELS: Record<string, string> = {
  WORKING_PAPERS: "Working Papers",
  CASE_MEMO: "Case Memo",
  PENALTY_LETTER: "Penalty Letter",
  OIC_NARRATIVE: "OIC Narrative",
  GENERAL_ANALYSIS: "General Analysis",
  IA_ANALYSIS: "IA Analysis",
  CNC_ANALYSIS: "CNC Analysis",
  TFRP_ANALYSIS: "TFRP Analysis",
  INNOCENT_SPOUSE_ANALYSIS: "Innocent Spouse",
  APPEALS_REBUTTAL: "Appeals Rebuttal",
  CASE_SUMMARY: "Case Summary",
  RISK_ASSESSMENT: "Risk Assessment",
  WEB_RESEARCH: "Web Research",
}

const ACTION_LABELS: Record<string, string> = {
  APPROVE: "Approved",
  EDIT_APPROVE: "Edited & Approved",
  REJECT_REPROMPT: "Rejected (Re-prompt)",
  REJECT_MANUAL: "Rejected (Manual)",
}

const ACTION_COLORS: Record<string, string> = {
  APPROVE: "bg-c-success-soft text-c-success",
  EDIT_APPROVE: "bg-c-warning-soft text-c-warning",
  REJECT_REPROMPT: "bg-c-danger-soft text-c-danger",
  REJECT_MANUAL: "bg-c-danger-soft text-c-danger",
}

const PERIOD_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "All time", value: "all" },
]

interface AnalyticsData {
  period: { days: number | string; since: string }
  approvalRates: Record<string, { approved: number; total: number; rate: number }>
  actionCounts: Record<string, number>
  reviewVelocity: Record<string, { totalMs: number; count: number; avgMinutes: number }>
  rejectionThemes: [string, number][]
  editSections: [string, number][]
  kbHealth: { category: string; _count: number; _avg: { freshnessScore: number | null } }[]
  promptPerformance: { systemPromptVersion: string | null; status: string; _count: number }[]
  totalTasks: number
  totalReviews: number
}

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState("30")
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/analytics?days=${period}`)
      if (!res.ok) throw new Error("Failed to fetch analytics")
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || "Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Computed values
  const overallApprovalRate = data
    ? (() => {
        let approved = 0
        let total = 0
        for (const v of Object.values(data.approvalRates)) {
          approved += v.approved
          total += v.total
        }
        return total > 0 ? Math.round((approved / total) * 100) : 0
      })()
    : 0

  const avgReviewMinutes = data
    ? (() => {
        let totalMs = 0
        let count = 0
        for (const v of Object.values(data.reviewVelocity)) {
          totalMs += v.totalMs
          count += v.count
        }
        return count > 0 ? Math.round(totalMs / count / 60000) : 0
      })()
    : 0

  const kbTotal = data
    ? (data.kbHealth as any[]).reduce((sum, k) => sum + (k._count || 0), 0)
    : 0

  const maxThemeCount = data?.rejectionThemes?.[0]?.[1] || 1

  function rateColor(rate: number) {
    if (rate >= 80) return "text-c-success"
    if (rate >= 50) return "text-c-warning"
    return "text-c-danger"
  }

  function rateBarColor(rate: number) {
    if (rate >= 80) return "bg-c-success"
    if (rate >= 50) return "bg-c-warning-soft"
    return "bg-c-danger"
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading analytics...
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-c-info-soft">
                    <BarChart3 className="h-5 w-5 text-c-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total AI Tasks</p>
                    <p className="text-2xl font-medium">{data.totalTasks}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-c-success-soft">
                    <CheckCircle className="h-5 w-5 text-c-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approval Rate</p>
                    <p className={`text-2xl font-medium ${rateColor(overallApprovalRate)}`}>
                      {overallApprovalRate}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-c-warning-soft">
                    <Clock className="h-5 w-5 text-c-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Review Time</p>
                    <p className="text-2xl font-medium">
                      {avgReviewMinutes > 0 ? `${avgReviewMinutes}m` : "--"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <BookOpen className="h-5 w-5 text-purple-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">KB Documents</p>
                    <p className="text-2xl font-medium">{kbTotal}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Approval rate by task type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approval Rate by Task Type</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(data.approvalRates).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No task data for this period</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(data.approvalRates)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([taskType, stats]) => (
                        <div key={taskType} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span>{TASK_TYPE_LABELS[taskType] || taskType}</span>
                            <span className={`font-medium ${rateColor(stats.rate)}`}>
                              {stats.rate}% ({stats.approved}/{stats.total})
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${rateBarColor(stats.rate)}`}
                              style={{ width: `${stats.rate}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Review action breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review Action Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {data.totalReviews === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No reviews for this period</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(data.actionCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([action, count]) => {
                        const pct = Math.round((count / data.totalReviews) * 100)
                        return (
                          <div key={action} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className={ACTION_COLORS[action] || ""}>
                                {ACTION_LABELS[action] || action}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{count}</span>
                              <span className="text-muted-foreground">({pct}%)</span>
                            </div>
                          </div>
                        )
                      })}
                    <div className="pt-2 border-t text-sm text-muted-foreground">
                      Total reviews: {data.totalReviews}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rejection themes */}
          {data.rejectionThemes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rejection Themes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rejectionThemes.map(([theme, count]) => (
                    <div key={theme} className="flex items-center gap-3">
                      <span className="text-sm w-24 capitalize">{theme}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-c-danger rounded-full transition-all flex items-center justify-end pr-2"
                          style={{ width: `${Math.max((count / maxThemeCount) * 100, 8)}%` }}
                        >
                          <span className="text-[10px] font-medium text-white">{count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Review velocity */}
          {Object.keys(data.reviewVelocity).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review Velocity</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Type</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                      <TableHead className="text-right">Reviews</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.reviewVelocity)
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([taskType, stats]) => (
                        <TableRow key={taskType}>
                          <TableCell>{TASK_TYPE_LABELS[taskType] || taskType}</TableCell>
                          <TableCell className="text-right">
                            {stats.avgMinutes > 0 ? `${stats.avgMinutes} min` : "--"}
                          </TableCell>
                          <TableCell className="text-right">{stats.count}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* KB Health */}
          {(data.kbHealth as any[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Knowledge Base Health</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Documents</TableHead>
                      <TableHead className="text-right">Avg Freshness</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.kbHealth as any[])
                      .sort((a, b) => (b._count || 0) - (a._count || 0))
                      .map((kb: any) => {
                        const freshness = kb._avg?.freshnessScore
                        const freshnessLabel = freshness != null ? `${Math.round(freshness * 100)}%` : "--"
                        const freshnessColor =
                          freshness == null
                            ? ""
                            : freshness >= 0.7
                              ? "text-c-success"
                              : freshness >= 0.4
                                ? "text-c-warning"
                                : "text-c-danger"
                        return (
                          <TableRow key={kb.category}>
                            <TableCell className="capitalize">
                              {(kb.category || "").replace(/_/g, " ").toLowerCase()}
                            </TableCell>
                            <TableCell className="text-right">{kb._count || 0}</TableCell>
                            <TableCell className={`text-right font-medium ${freshnessColor}`}>
                              {freshnessLabel}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Edit sections frequency */}
          {data.editSections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most Edited Sections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.editSections.slice(0, 10).map(([section, count]) => (
                    <div key={section} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{section.replace(/_/g, " ").toLowerCase()}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
