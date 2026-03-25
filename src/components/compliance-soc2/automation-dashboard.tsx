"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  Database,
  Shield,
  Zap,
} from "lucide-react"

interface HealthCheckInfo {
  id: string
  checkType: string
  controlId: string
  interval: string
  lastRun: string | null
  lastResult: string | null
  nextRun: string | null
}

interface AutomationStatus {
  lastRunAt: string | null
  healthChecks: HealthCheckInfo[]
  openIssues: number
  slaBreaches: number
  evidenceCount: number
}

interface RunResult {
  success: boolean
  action: string
  checksRun?: number
  issuesCreated?: number
  evidenceCollected?: number
  controlsUpdated?: number
  seededCount?: number
  timestamp?: string
}

export function AutomationDashboard() {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [lastRunResult, setLastRunResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/compliance-automation")
      if (!res.ok) throw new Error("Failed to fetch automation status")
      const data = await res.json()
      setStatus(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleRun = async () => {
    try {
      setRunning(true)
      setLastRunResult(null)
      const res = await fetch("/api/admin/compliance-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      })
      if (!res.ok) throw new Error("Automation run failed")
      const result = await res.json()
      setLastRunResult(result)
      await fetchStatus()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const handleSeed = async () => {
    try {
      setSeeding(true)
      setLastRunResult(null)
      const res = await fetch("/api/admin/compliance-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      })
      if (!res.ok) throw new Error("Health check seeding failed")
      const result = await res.json()
      setLastRunResult(result)
      await fetchStatus()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSeeding(false)
    }
  }

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">Not Run</Badge>
    switch (result.toUpperCase()) {
      case "PASS":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            Pass
          </Badge>
        )
      case "FAIL":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            Fail
          </Badge>
        )
      case "WARNING":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            Warning
          </Badge>
        )
      default:
        return <Badge variant="outline">{result}</Badge>
    }
  }

  const formatInterval = (interval: string) => {
    switch (interval) {
      case "15m":
        return "Every 15 min"
      case "1h":
        return "Hourly"
      case "24h":
        return "Daily"
      case "weekly":
        return "Weekly"
      default:
        return interval
    }
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "Never"
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.round(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.round(diffHours / 24)
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !status) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchStatus}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const passCount =
    status?.healthChecks.filter(
      (hc) => hc.lastResult?.toUpperCase() === "PASS"
    ).length || 0
  const failCount =
    status?.healthChecks.filter(
      (hc) => hc.lastResult?.toUpperCase() === "FAIL"
    ).length || 0
  const warnCount =
    status?.healthChecks.filter(
      (hc) => hc.lastResult?.toUpperCase() === "WARNING"
    ).length || 0
  const totalChecks = status?.healthChecks.length || 0

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Compliance Automation</h2>
          <p className="text-sm text-muted-foreground">
            Automated health checks, evidence collection, and control status
            updates
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSeed}
            disabled={seeding || running}
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Seed Health Checks
          </Button>
          <Button onClick={handleRun} disabled={running || seeding}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Run All Checks
          </Button>
        </div>
      </div>

      {/* Last run result toast */}
      {lastRunResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">
                {lastRunResult.action === "seed"
                  ? `Seeded ${lastRunResult.seededCount} health checks`
                  : `Automation complete: ${lastRunResult.checksRun} checks run, ${lastRunResult.issuesCreated} issues created, ${lastRunResult.evidenceCollected} evidence collected, ${lastRunResult.controlsUpdated} controls updated`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Run</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold">
                {formatTime(status?.lastRunAt || null)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Passing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-lg font-semibold text-green-700">
                {passCount}/{totalChecks}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-lg font-semibold text-red-700">
                {failCount}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Issues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-lg font-semibold">
                {status?.openIssues || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>SLA Breaches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(status?.slaBreaches || 0) > 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <Shield className="h-4 w-4 text-green-600" />
              )}
              <span
                className={`text-lg font-semibold ${
                  (status?.slaBreaches || 0) > 0
                    ? "text-red-700"
                    : "text-green-700"
                }`}
              >
                {status?.slaBreaches || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLA breach alert */}
      {(status?.slaBreaches || 0) > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-800">
                {status?.slaBreaches} compliance issue(s) have breached their
                SLA deadline. Immediate attention required.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health check grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Health Check Status</CardTitle>
              <CardDescription>
                {totalChecks} automated checks configured across{" "}
                {totalChecks} controls
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchStatus}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {totalChecks === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No health checks configured.</p>
              <p className="text-sm mt-1">
                Click &quot;Seed Health Checks&quot; to create automated checks
                for all AUTOMATED controls.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {status?.healthChecks.map((hc) => (
                <div
                  key={hc.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          hc.lastResult?.toUpperCase() === "PASS"
                            ? "#22c55e"
                            : hc.lastResult?.toUpperCase() === "FAIL"
                              ? "#ef4444"
                              : hc.lastResult?.toUpperCase() === "WARNING"
                                ? "#eab308"
                                : "#9ca3af",
                      }}
                    />
                    <div>
                      <div className="font-medium text-sm">
                        {hc.controlId} &mdash; {hc.checkType.replace(/_/g, " ")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatInterval(hc.interval)} &middot; Last run:{" "}
                        {formatTime(hc.lastRun)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">
                      Next: {hc.nextRun ? formatTime(hc.nextRun) : "N/A"}
                    </div>
                    {getResultBadge(hc.lastResult)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence collection status */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence Collection</CardTitle>
          <CardDescription>
            Automated evidence collected by the compliance engine
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Activity className="h-8 w-8 text-blue-600" />
            <div>
              <div className="text-2xl font-bold">
                {status?.evidenceCount || 0}
              </div>
              <div className="text-sm text-muted-foreground">
                Total automated evidence items collected
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
