"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Network, CheckCircle, Clock, Brain, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"

const PERIOD_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "All time", value: "all" },
]

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  READY_FOR_REVIEW: "Ready for Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-gray-200 text-gray-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  READY_FOR_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
}

const ACTION_LABELS: Record<string, string> = {
  APPROVE: "Approved",
  EDIT_APPROVE: "Edit-Approved",
  REJECT_REPROMPT: "Re-prompted",
  REJECT_MANUAL: "Rejected (Manual)",
}

const ACTION_COLORS: Record<string, string> = {
  APPROVE: "bg-green-500",
  EDIT_APPROVE: "bg-blue-500",
  REJECT_REPROMPT: "bg-amber-500",
  REJECT_MANUAL: "bg-red-500",
}

const CASE_TYPE_LABELS: Record<string, string> = {
  OIC: "Offer in Compromise",
  IA: "Installment Agreement",
  PENALTY: "Penalty Abatement",
  CNC: "Currently Not Collectible",
  TFRP: "Trust Fund Recovery",
  INNOCENT_SPOUSE: "Innocent Spouse",
  UNFILED: "Unfiled Returns",
  AUDIT: "Audit",
  CDP: "Collection Due Process",
  ERC: "Employee Retention Credit",
}

interface SwitchboardData {
  period: { days: number | string; since: string }
  summary: {
    totalTasks: number
    approvalRate: number
    avgReviewMinutes: number
    learnedPatternCount: number
  }
  tasksByStatus: Array<{ status: string; _count: number }>
  tasksByDay: Array<{ day: string; status: string; count: number }>
  reviewActions: Array<{ action: string; _count: number }>
  reviewVelocity: Record<string, { totalMs: number; count: number; avgMinutes: number }>
  rejectionThemes: [string, number][]
  editHotspots: Array<{ name: string; count: number; commonChange: string }>
  modelPerf: Array<{ modelUsed: string; status: string; _count: number }>
  contextLogs: Array<{ metadata: any }>
  learnedPatterns: Record<string, string>
  activeBiases: Array<{ caseType: string; taskType: string; bias: string }>
  contextPacket: any | null
  contextFormatted: string | null
}

export function SwitchboardDashboard() {
  const [period, setPeriod] = useState("30")
  const [data, setData] = useState<SwitchboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Context inspector state
  const [inspectCaseId, setInspectCaseId] = useState("")
  const [inspecting, setInspecting] = useState(false)
  const [contextData, setContextData] = useState<{ packet: any; formatted: string } | null>(null)

  // Collapsible sections
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set())
  const [expandedContextSections, setExpandedContextSections] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/switchboard?days=${period}`)
      if (!res.ok) throw new Error("Failed to fetch switchboard data")
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || "Failed to load switchboard data")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const inspectContext = async () => {
    if (!inspectCaseId.trim()) return
    setInspecting(true)
    try {
      const res = await fetch(`/api/admin/switchboard?caseId=${encodeURIComponent(inspectCaseId.trim())}`)
      if (!res.ok) throw new Error("Failed to inspect context")
      const json = await res.json()
      if (json.contextPacket) {
        setContextData({ packet: json.contextPacket, formatted: json.contextFormatted })
      } else {
        setContextData(null)
        setError("Case not found or no context available")
      }
    } catch (err: any) {
      setError(err.message || "Failed to inspect context")
    } finally {
      setInspecting(false)
    }
  }

  const togglePattern = (caseType: string) => {
    setExpandedPatterns((prev) => {
      const next = new Set(prev)
      if (next.has(caseType)) next.delete(caseType)
      else next.add(caseType)
      return next
    })
  }

  const toggleContextSection = (section: string) => {
    setExpandedContextSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  // Compute funnel data
  const funnelData = data
    ? (() => {
        const statusMap: Record<string, number> = {}
        for (const row of data.tasksByStatus) {
          statusMap[row.status] = row._count
        }
        const total = data.summary.totalTasks || 1
        return {
          QUEUED: statusMap["QUEUED"] || 0,
          PROCESSING: statusMap["PROCESSING"] || 0,
          READY_FOR_REVIEW: statusMap["READY_FOR_REVIEW"] || 0,
          APPROVED: statusMap["APPROVED"] || 0,
          REJECTED: statusMap["REJECTED"] || 0,
          total,
        }
      })()
    : null

  // Compute review action totals
  const reviewTotal = data
    ? data.reviewActions.reduce((sum, r) => sum + r._count, 0)
    : 0

  // Compute model comparison
  const modelComparison = data
    ? (() => {
        const models: Record<string, { total: number; approved: number; edited: number; rejected: number }> = {}
        for (const row of data.modelPerf) {
          const model = row.modelUsed || "unknown"
          if (!models[model]) models[model] = { total: 0, approved: 0, edited: 0, rejected: 0 }
          models[model].total += row._count
          if (row.status === "APPROVED") models[model].approved += row._count
          if (row.status === "REJECTED") models[model].rejected += row._count
        }
        return Object.entries(models).map(([model, stats]) => ({
          model,
          total: stats.total,
          approvedPct: stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0,
          rejectedPct: stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0,
        }))
      })()
    : []

  function rateColor(rate: number) {
    if (rate >= 80) return "text-green-700"
    if (rate >= 50) return "text-amber-700"
    return "text-red-700"
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
            Loading switchboard data...
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Row 1: Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100">
                    <Network className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total AI Tasks</p>
                    <p className="text-2xl font-medium">{data.summary.totalTasks}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <CheckCircle className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approval Rate</p>
                    <p className={`text-2xl font-medium ${rateColor(data.summary.approvalRate)}`}>
                      {data.summary.approvalRate}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Clock className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Review Time</p>
                    <p className="text-2xl font-medium">
                      {data.summary.avgReviewMinutes > 0 ? `${data.summary.avgReviewMinutes}m` : "--"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <Brain className="h-5 w-5 text-purple-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Learned Patterns</p>
                    <p className="text-2xl font-medium">{data.summary.learnedPatternCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Pipeline Funnel */}
          {funnelData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Funnel</CardTitle>
                <CardDescription>AI task flow from submission to resolution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(["QUEUED", "PROCESSING", "READY_FOR_REVIEW", "APPROVED", "REJECTED"] as const).map((status) => {
                    const count = funnelData[status]
                    const pct = funnelData.total > 0 ? Math.round((count / funnelData.total) * 100) : 0
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={STATUS_COLORS[status] || ""}>
                              {STATUS_LABELS[status] || status}
                            </Badge>
                          </div>
                          <span className="font-medium">
                            {count} <span className="text-muted-foreground">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              status === "APPROVED"
                                ? "bg-green-500"
                                : status === "REJECTED"
                                  ? "bg-red-500"
                                  : status === "READY_FOR_REVIEW"
                                    ? "bg-amber-500"
                                    : status === "PROCESSING"
                                      ? "bg-blue-500"
                                      : "bg-gray-400"
                            }`}
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Review action breakdown within funnel */}
                {reviewTotal > 0 && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm font-medium mb-3">Review Outcomes</p>
                    <div className="flex gap-4">
                      {data.reviewActions
                        .sort((a, b) => b._count - a._count)
                        .map((ra) => {
                          const pct = Math.round((ra._count / reviewTotal) * 100)
                          return (
                            <div key={ra.action} className="flex items-center gap-2 text-sm">
                              <div className={`w-3 h-3 rounded-full ${ACTION_COLORS[ra.action] || "bg-gray-400"}`} />
                              <span>{ACTION_LABELS[ra.action] || ra.action}</span>
                              <span className="font-medium">{ra._count}</span>
                              <span className="text-muted-foreground">({pct}%)</span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Row 3: Learned Patterns + Prompt Biases */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* What the AI is Learning */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What the AI is Learning</CardTitle>
                <CardDescription>Review patterns learned per case type</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(data.learnedPatterns).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No review patterns learned yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.learnedPatterns).map(([caseType, pattern]) => (
                      <div key={caseType} className="border rounded-lg">
                        <button
                          className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg"
                          onClick={() => togglePattern(caseType)}
                        >
                          <span>{CASE_TYPE_LABELS[caseType] || caseType}</span>
                          {expandedPatterns.has(caseType) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        {expandedPatterns.has(caseType) && (
                          <div className="px-3 pb-3">
                            <pre className="text-xs whitespace-pre-wrap text-muted-foreground bg-muted/50 p-2 rounded">
                              {pattern}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Prompt Injections */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Prompt Injections</CardTitle>
                <CardDescription>Biases injected into deliverable prompts</CardDescription>
              </CardHeader>
              <CardContent>
                {data.activeBiases.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active prompt biases
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {data.activeBiases.map((bias, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{CASE_TYPE_LABELS[bias.caseType] || bias.caseType}</Badge>
                          <Badge variant="secondary">{bias.taskType.replace(/_/g, " ")}</Badge>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-muted/50 p-2 rounded">
                          {bias.bias}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Edit Hotspots + Rejection Themes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Edit Hotspots */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit Hotspots</CardTitle>
                <CardDescription>Most frequently edited document sections</CardDescription>
              </CardHeader>
              <CardContent>
                {data.editHotspots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No edit data for this period
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section Name</TableHead>
                        <TableHead className="text-right">Edit Count</TableHead>
                        <TableHead>Common Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.editHotspots.slice(0, 10).map((hotspot) => (
                        <TableRow key={hotspot.name}>
                          <TableCell className="font-medium">{hotspot.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{hotspot.count}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {hotspot.commonChange}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Rejection Themes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rejection Themes</CardTitle>
                <CardDescription>Common reasons for AI output rejection</CardDescription>
              </CardHeader>
              <CardContent>
                {data.rejectionThemes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No rejections for this period
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Theme</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rejectionThemes.map(([theme, count]) => (
                        <TableRow key={theme}>
                          <TableCell className="capitalize font-medium">{theme}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{count}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 5: Context Inspector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context Inspector</CardTitle>
              <CardDescription>Inspect the full AI context packet assembled for any case</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Enter Case ID..."
                  value={inspectCaseId}
                  onChange={(e) => setInspectCaseId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && inspectContext()}
                  className="max-w-sm"
                />
                <Button onClick={inspectContext} disabled={inspecting || !inspectCaseId.trim()}>
                  {inspecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Inspecting...
                    </>
                  ) : (
                    "Inspect Context"
                  )}
                </Button>
              </div>

              {contextData && (
                <div className="space-y-3">
                  {/* Context packet sections */}
                  {[
                    { key: "identity", label: "Case Identity", content: contextData.packet ? `Case: ${contextData.packet.tabsNumber}\nType: ${contextData.packet.caseType}\nStatus: ${contextData.packet.status}\nFiling Status: ${contextData.packet.filingStatus || "N/A"}\nLiability: ${contextData.packet.totalLiability ? `$${contextData.packet.totalLiability.toLocaleString()}` : "N/A"}` : "" },
                    { key: "intelligence", label: "Intelligence", content: contextData.packet?.digest || "No intelligence digest available" },
                    { key: "documents", label: "Documents", content: contextData.packet?.documentManifest || "No documents" },
                    { key: "deadlines", label: "Deadlines", content: contextData.packet?.upcomingDeadlines?.length > 0 ? contextData.packet.upcomingDeadlines.map((d: any) => `${d.title}: ${d.dueDate} (${d.daysRemaining} days, ${d.priority})`).join("\n") : "No upcoming deadlines" },
                    { key: "irs", label: "IRS Position", content: contextData.packet?.irsLastAction ? `Last Action: ${contextData.packet.irsLastAction}\nAssigned Unit: ${contextData.packet.irsAssignedUnit || "N/A"}\nCSED: ${contextData.packet.csedEarliest || "N/A"} to ${contextData.packet.csedLatest || "N/A"}` : "No IRS position data" },
                    { key: "notes", label: "Notes Used", content: contextData.packet?.clientNotes || "No notes" },
                    { key: "insights", label: "Review Insights", content: contextData.packet?.reviewInsights || "No review insights" },
                    { key: "knowledge", label: "Knowledge Context", content: contextData.packet?.knowledgeContext || "No knowledge context" },
                  ].map((section) => (
                    <div key={section.key} className="border rounded-lg">
                      <button
                        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg"
                        onClick={() => toggleContextSection(section.key)}
                      >
                        <span>{section.label}</span>
                        {expandedContextSections.has(section.key) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      {expandedContextSections.has(section.key) && (
                        <div className="px-3 pb-3">
                          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-muted/50 p-3 rounded max-h-64 overflow-y-auto">
                            {section.content}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Raw formatted prompt */}
                  {contextData.formatted && (
                    <div className="border rounded-lg">
                      <button
                        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg"
                        onClick={() => toggleContextSection("raw")}
                      >
                        <span>Raw Formatted Prompt</span>
                        {expandedContextSections.has("raw") ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      {expandedContextSections.has("raw") && (
                        <div className="px-3 pb-3">
                          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-muted/50 p-3 rounded max-h-96 overflow-y-auto">
                            {contextData.formatted}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Row 6: Model Comparison */}
          {modelComparison.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model Comparison</CardTitle>
                <CardDescription>Performance breakdown by AI model</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Total Tasks</TableHead>
                      <TableHead className="text-right">Approved %</TableHead>
                      <TableHead className="text-right">Reject Rate %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelComparison
                      .sort((a, b) => b.total - a.total)
                      .map((row) => (
                        <TableRow key={row.model}>
                          <TableCell className="font-mono text-sm">{row.model}</TableCell>
                          <TableCell className="text-right font-medium">{row.total}</TableCell>
                          <TableCell className={`text-right font-medium ${rateColor(row.approvedPct)}`}>
                            {row.approvedPct}%
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.rejectedPct}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
