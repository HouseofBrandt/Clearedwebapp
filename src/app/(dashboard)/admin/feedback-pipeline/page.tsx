"use client"

import { useState, useEffect, useCallback } from "react"
import {
  GitBranch,
  Bug,
  Lightbulb,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowUpRight,
  Loader2,
} from "lucide-react"

interface PipelineData {
  summary: {
    totalUnsynced: number
    bugs: number
    features: number
    observations: number
    observationBreakdown: Array<{ type: string; _count: number }>
  }
  pipelineHealth: {
    observerActive: boolean
    observationsLastHour: number
    syncedLast24h: number
    githubTokenConfigured: boolean
    syncSecretConfigured: boolean
  }
  recentObservations: Array<{
    id: string
    type: string
    severity: string
    title: string
    description: string
    route: string | null
    syncedToTasks: boolean
    createdAt: string
  }>
  recentBugs: Array<{
    id: string
    subject: string
    body: string
    implementationStatus: string | null
    createdAt: string
  }>
  recentFeatures: Array<{
    id: string
    subject: string
    body: string
    implementationStatus: string | null
    createdAt: string
  }>
  reviewInsights: Array<{ caseType: string; _count: number }>
}

interface SyncResult {
  itemsSynced: number
  skippedDuplicates: number
  commitSha: string | null
}

export default function FeedbackPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/feedback-dashboard")
      if (!res.ok) throw new Error(`${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e: any) {
      setError(e.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  async function handleSync(dryRun: boolean) {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/dev/feedback-sync?maxItems=10${dryRun ? "&dryRun=true" : ""}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
      const result = await res.json()
      setSyncResult(result)
      if (!dryRun) fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--c-teal)]" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
        Failed to load pipeline data: {error}
      </div>
    )
  }

  const health = data?.pipelineHealth
  const summary = data?.summary

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
            Feedback Pipeline
          </h1>
          <p className="text-[var(--c-gray-500)]">
            Junebug observations and user feedback synced to TASKS.md for Claude Code
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border border-[var(--c-gray-200)] hover:bg-[var(--c-gray-50)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCard
          title="Unsynced Items"
          value={summary?.totalUnsynced ?? 0}
          subtitle={`${summary?.bugs ?? 0} bugs, ${summary?.features ?? 0} features, ${summary?.observations ?? 0} observations`}
          icon={<GitBranch className="w-4 h-4" />}
          status={
            (summary?.totalUnsynced ?? 0) > 10
              ? "warning"
              : (summary?.totalUnsynced ?? 0) > 0
                ? "info"
                : "good"
          }
        />
        <HealthCard
          title="Observer Status"
          value={health?.observerActive ? "Active" : "Idle"}
          subtitle={`${health?.observationsLastHour ?? 0} observations in last hour`}
          icon={<Eye className="w-4 h-4" />}
          status={health?.observerActive ? "good" : "info"}
        />
        <HealthCard
          title="Synced (24h)"
          value={health?.syncedLast24h ?? 0}
          subtitle="Items synced to TASKS.md"
          icon={<ArrowUpRight className="w-4 h-4" />}
          status="good"
        />
        <HealthCard
          title="Pipeline Config"
          value={health?.githubTokenConfigured && health?.syncSecretConfigured ? "Ready" : "Incomplete"}
          subtitle={`GitHub: ${health?.githubTokenConfigured ? "OK" : "Missing"} | Secret: ${health?.syncSecretConfigured ? "OK" : "Missing"}`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          status={
            health?.githubTokenConfigured && health?.syncSecretConfigured ? "good" : "warning"
          }
        />
      </div>

      {/* Sync Controls */}
      <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-[var(--c-gray-50)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--c-gray-900)]">Sync to TASKS.md</h2>
            <p className="text-xs text-[var(--c-gray-500)] mt-0.5">
              Push unsynced feedback items to the repo for the Claude Code loop to pick up
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              className="px-3 py-1.5 text-sm rounded-md border border-[var(--c-gray-300)] hover:bg-white transition-colors disabled:opacity-50"
            >
              Dry Run
            </button>
            <button
              onClick={() => handleSync(false)}
              disabled={syncing || !health?.githubTokenConfigured}
              className="px-3 py-1.5 text-sm rounded-md bg-[var(--c-teal)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {syncing && <Loader2 className="w-3 h-3 animate-spin" />}
              Sync Now
            </button>
          </div>
        </div>
        {syncResult && (
          <div className="mt-3 p-3 rounded bg-white border border-[var(--c-gray-200)] text-sm">
            <p>
              Synced: <strong>{syncResult.itemsSynced}</strong> | Skipped duplicates:{" "}
              <strong>{syncResult.skippedDuplicates}</strong>
              {syncResult.commitSha && (
                <>
                  {" "}
                  | Commit: <code className="text-xs">{syncResult.commitSha.slice(0, 7)}</code>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Review Insights Grid */}
      {data?.reviewInsights && data.reviewInsights.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3">
            Rejection Clusters by Case Type
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.reviewInsights.map((ri) => (
              <div
                key={ri.caseType}
                className="p-3 rounded-lg border border-[var(--c-gray-200)] text-center"
              >
                <p className="text-lg font-[family-name:var(--font-jetbrains)]">{ri._count}</p>
                <p className="text-xs text-[var(--c-gray-500)]">{ri.caseType}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observation Breakdown */}
      {summary?.observationBreakdown && summary.observationBreakdown.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3">
            Observation Types (Unsynced)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {summary.observationBreakdown.map((ob: any) => (
              <div
                key={ob.type}
                className="p-3 rounded-lg border border-[var(--c-gray-200)] text-center"
              >
                <p className="text-lg font-[family-name:var(--font-jetbrains)]">{ob._count}</p>
                <p className="text-xs text-[var(--c-gray-500)]">{ob.type.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Observations */}
      <div>
        <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3">Recent Observations</h2>
        <div className="space-y-2">
          {(!data?.recentObservations || data.recentObservations.length === 0) && (
            <p className="text-sm text-[var(--c-gray-400)] italic">No observations yet</p>
          )}
          {data?.recentObservations?.map((obs) => (
            <div
              key={obs.id}
              className="p-3 rounded-lg border border-[var(--c-gray-200)] flex items-start gap-3"
            >
              <SeverityBadge severity={obs.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-gray-100)] text-[var(--c-gray-600)]">
                    {obs.type.replace(/_/g, " ")}
                  </span>
                  {obs.syncedToTasks && (
                    <span className="text-xs text-[var(--c-teal)]">synced</span>
                  )}
                  <span className="text-xs text-[var(--c-gray-400)] ml-auto">
                    {new Date(obs.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-[var(--c-gray-900)] mt-1 truncate">{obs.title}</p>
                {obs.route && (
                  <p className="text-xs text-[var(--c-gray-500)] mt-0.5">{obs.route}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Bug Reports & Feature Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3 flex items-center gap-2">
            <Bug className="w-4 h-4 text-red-500" />
            Recent Bug Reports
          </h2>
          <div className="space-y-2">
            {(!data?.recentBugs || data.recentBugs.length === 0) && (
              <p className="text-sm text-[var(--c-gray-400)] italic">No bug reports</p>
            )}
            {data?.recentBugs?.map((bug) => (
              <div key={bug.id} className="p-3 rounded-lg border border-[var(--c-gray-200)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--c-gray-900)] font-medium">{bug.subject}</p>
                  {bug.implementationStatus && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-teal)]/10 text-[var(--c-teal)]">
                      {bug.implementationStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--c-gray-500)] mt-1 line-clamp-2">{bug.body}</p>
                <p className="text-xs text-[var(--c-gray-400)] mt-1">
                  {new Date(bug.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Recent Feature Requests
          </h2>
          <div className="space-y-2">
            {(!data?.recentFeatures || data.recentFeatures.length === 0) && (
              <p className="text-sm text-[var(--c-gray-400)] italic">No feature requests</p>
            )}
            {data?.recentFeatures?.map((feat) => (
              <div key={feat.id} className="p-3 rounded-lg border border-[var(--c-gray-200)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--c-gray-900)] font-medium">{feat.subject}</p>
                  {feat.implementationStatus && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-teal)]/10 text-[var(--c-teal)]">
                      {feat.implementationStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--c-gray-500)] mt-1 line-clamp-2">{feat.body}</p>
                <p className="text-xs text-[var(--c-gray-400)] mt-1">
                  {new Date(feat.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthCard({
  title,
  value,
  subtitle,
  icon,
  status,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: React.ReactNode
  status: "good" | "warning" | "error" | "info"
}) {
  const borderColor = {
    good: "border-[var(--c-teal)]/30",
    warning: "border-amber-300",
    error: "border-red-300",
    info: "border-[var(--c-gray-200)]",
  }[status]

  return (
    <div className={`p-4 rounded-lg border ${borderColor} bg-white`}>
      <div className="flex items-center gap-2 text-[var(--c-gray-500)] mb-2">
        {icon}
        <span className="text-xs">{title}</span>
      </div>
      <p className="text-xl font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-900)]">
        {value}
      </p>
      <p className="text-xs text-[var(--c-gray-500)] mt-1">{subtitle}</p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "HIGH")
    return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
  if (severity === "MEDIUM")
    return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
  return <CheckCircle2 className="w-4 h-4 text-[var(--c-gray-400)] flex-shrink-0 mt-0.5" />
}
