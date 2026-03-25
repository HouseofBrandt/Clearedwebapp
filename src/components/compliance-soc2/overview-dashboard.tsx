"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Shield,
  Server,
  Cpu,
  Lock,
  Eye,
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { ControlDetail } from "./control-detail"

interface ControlData {
  id: string
  controlId: string
  tsc: string
  controlFamily: string
  description: string
  monitoringMethod: string
  status: string
  whatSoc2Requires: string
  howClearedMeetsIt: string
  whyItMatters: string
  lastEvidenceCollected: string | null
  nextReviewDate: string | null
  openIssueCount: number
  latestHealthResult: { status: string; details: any } | null
  evidenceCount: number
  issues: any[]
  evidence: any[]
}

const TSC_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  SECURITY: { label: "Security", icon: Shield, color: "text-blue-600" },
  AVAILABILITY: { label: "Availability", icon: Server, color: "text-green-600" },
  PROCESSING_INTEGRITY: { label: "Processing Integrity", icon: Cpu, color: "text-purple-600" },
  CONFIDENTIALITY: { label: "Confidentiality", icon: Lock, color: "text-amber-600" },
  PRIVACY: { label: "Privacy", icon: Eye, color: "text-rose-600" },
}

const STATUS_COLORS: Record<string, string> = {
  COMPLIANT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PARTIALLY_COMPLIANT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  NON_COMPLIANT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  NOT_ASSESSED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-blue-100 text-blue-800",
}

export function OverviewDashboard() {
  const [controls, setControls] = useState<ControlData[]>([])
  const [loading, setLoading] = useState(true)
  const [healthRunning, setHealthRunning] = useState(false)
  const [seedingControls, setSeedingControls] = useState(false)
  const [expandedControl, setExpandedControl] = useState<string | null>(null)
  const [activeTsc, setActiveTsc] = useState<string | null>(null)

  const fetchControls = useCallback(async () => {
    try {
      const url = activeTsc
        ? `/api/compliance/controls?tsc=${activeTsc}`
        : "/api/compliance/controls"
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setControls(data)
      }
    } catch (err) {
      console.error("Failed to fetch controls:", err)
    } finally {
      setLoading(false)
    }
  }, [activeTsc])

  useEffect(() => {
    fetchControls()
  }, [fetchControls])

  const runHealthChecks = async () => {
    setHealthRunning(true)
    try {
      await fetch("/api/compliance/health", { method: "POST" })
      await fetchControls()
    } catch (err) {
      console.error("Health check failed:", err)
    } finally {
      setHealthRunning(false)
    }
  }

  const seedControls = async () => {
    setSeedingControls(true)
    try {
      await fetch("/api/admin/seed-compliance", { method: "POST" })
      await fetchControls()
    } catch (err) {
      console.error("Seed failed:", err)
    } finally {
      setSeedingControls(false)
    }
  }

  // Calculate scores
  const totalControls = controls.length
  const compliant = controls.filter((c) => c.status === "COMPLIANT").length
  const partial = controls.filter((c) => c.status === "PARTIALLY_COMPLIANT").length
  const nonCompliant = controls.filter((c) => c.status === "NON_COMPLIANT").length
  const notAssessed = controls.filter((c) => c.status === "NOT_ASSESSED").length
  const score =
    totalControls > 0
      ? Math.round(((compliant + partial * 0.5) / totalControls) * 100)
      : 0

  // TSC breakdown
  const tscGroups = Object.entries(TSC_CONFIG).map(([tsc, config]) => {
    const tscControls = controls.filter((c) => c.tsc === tsc)
    const tscCompliant = tscControls.filter((c) => c.status === "COMPLIANT").length
    const tscPartial = tscControls.filter((c) => c.status === "PARTIALLY_COMPLIANT").length
    const tscScore =
      tscControls.length > 0
        ? Math.round(
            ((tscCompliant + tscPartial * 0.5) / tscControls.length) * 100
          )
        : 0
    return { tsc, ...config, controls: tscControls, score: tscScore }
  })

  // Active issues
  const allIssues = controls.flatMap((c) => c.issues || [])
  const openIssues = allIssues.filter(
    (i) => !["CLOSED", "ACCEPTED_RISK"].includes(i.status)
  )

  // Evidence status
  const withEvidence = controls.filter((c) => c.lastEvidenceCollected)
  const staleEvidence = withEvidence.filter((c) => {
    if (!c.lastEvidenceCollected) return false
    const days =
      (Date.now() - new Date(c.lastEvidenceCollected).getTime()) /
      (1000 * 60 * 60 * 24)
    return days > 90
  })

  const filteredControls = activeTsc
    ? controls.filter((c) => c.tsc === activeTsc)
    : controls

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (totalControls === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Shield className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-medium">No compliance controls found</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Seed the compliance controls database to get started with SOC 2 monitoring.
        </p>
        <Button onClick={seedControls} disabled={seedingControls}>
          {seedingControls ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Seeding Controls...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4 mr-2" />
              Seed Compliance Controls
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runHealthChecks}
            disabled={healthRunning}
          >
            {healthRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Run Health Checks
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchControls()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                Overall Compliance Score
              </p>
              <p className="text-6xl font-medium font-mono tabular-nums mt-1">
                {score}
                <span className="text-2xl text-muted-foreground">%</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{compliant} Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span>{partial} Partial</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span>{nonCompliant} Non-Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-gray-300 inline-block" />
                <span>{notAssessed} Not Assessed</span>
              </div>
            </div>
          </div>
          <Progress value={score} className="mt-4 h-3" />
        </CardContent>
      </Card>

      {/* TSC Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {tscGroups.map((group) => {
          const Icon = group.icon
          const isActive = activeTsc === group.tsc
          return (
            <Card
              key={group.tsc}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isActive ? "ring-2 ring-primary" : ""
              }`}
              onClick={() =>
                setActiveTsc(isActive ? null : group.tsc)
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Icon className={`h-5 w-5 ${group.color}`} />
                  <Badge variant="outline" className="text-xs">
                    {group.controls.length}
                  </Badge>
                </div>
                <CardTitle className="text-sm">{group.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium font-mono tabular-nums">{group.score}%</div>
                <Progress value={group.score} className="mt-2 h-2" />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Two-column layout: Issues + Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Issues</CardTitle>
            <CardDescription>
              {openIssues.length} open issue{openIssues.length !== 1 ? "s" : ""}{" "}
              requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {openIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active compliance issues
              </p>
            ) : (
              <div className="space-y-3">
                {openIssues
                  .sort((a, b) => {
                    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
                    return (
                      (severityOrder[a.severity as keyof typeof severityOrder] ?? 4) -
                      (severityOrder[b.severity as keyof typeof severityOrder] ?? 4)
                    )
                  })
                  .slice(0, 10)
                  .map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <Badge
                        className={`text-xs shrink-0 ${
                          SEVERITY_COLORS[issue.severity] || ""
                        }`}
                      >
                        {issue.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {issue.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Status: {issue.status}
                          {issue.slaDeadline && (
                            <>
                              {" "}
                              &middot; SLA:{" "}
                              {new Date(issue.slaDeadline).toLocaleDateString()}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evidence Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evidence Collection</CardTitle>
            <CardDescription>
              Evidence freshness across all controls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                <p className="text-2xl font-medium text-green-700 dark:text-green-300 font-mono tabular-nums">
                  {withEvidence.length - staleEvidence.length}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">Current</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                <p className="text-2xl font-medium text-yellow-700 dark:text-yellow-300 font-mono tabular-nums">
                  {staleEvidence.length}
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Stale</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
                <p className="text-2xl font-medium text-red-700 dark:text-red-300 font-mono tabular-nums">
                  {totalControls - withEvidence.length}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">Missing</p>
              </div>
            </div>
            <Progress
              value={
                totalControls > 0
                  ? ((withEvidence.length - staleEvidence.length) / totalControls) *
                    100
                  : 0
              }
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {withEvidence.length} of {totalControls} controls have evidence collected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Control List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {activeTsc
              ? `${TSC_CONFIG[activeTsc]?.label} Controls`
              : "All Controls"}
          </CardTitle>
          <CardDescription>
            {filteredControls.length} control{filteredControls.length !== 1 ? "s" : ""}
            {activeTsc && (
              <Button
                variant="link"
                size="sm"
                className="ml-2 p-0 h-auto"
                onClick={() => setActiveTsc(null)}
              >
                Show all
              </Button>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredControls.map((control) => (
              <ControlDetail
                key={control.id}
                control={control}
                expanded={expandedControl === control.controlId}
                onToggle={() =>
                  setExpandedControl(
                    expandedControl === control.controlId
                      ? null
                      : control.controlId
                  )
                }
                onStatusChange={async (newStatus) => {
                  await fetch("/api/compliance/controls", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      controlId: control.controlId,
                      status: newStatus,
                    }),
                  })
                  fetchControls()
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
