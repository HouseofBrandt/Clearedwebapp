"use client"

import { useState } from "react"
import {
  Database,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  FileText,
  Clock,
  Loader2,
  Play,
} from "lucide-react"
import Link from "next/link"

type SourceHealth = {
  id: string
  name: string
  sourceId: string
  enabled: boolean
  lastFetchedAt: string | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  errorCount: number
}

type OverviewData = {
  sources: SourceHealth[]
  ingestionSummary: {
    runsToday: number
    newItems: number
    changedItems: number
    skippedItems: number
    failedItems: number
  }
  benchmarkStats: {
    avgPrecision: number
    avgRecall: number
    totalRuns: number
    driftCount: number
  }
  latestDigest: {
    id: string
    digestDate: string
    newAuthorities: number
    changedAuthorities: number
    supersededItems: number
    benchmarkDrifts: number
    summary: string
    publishedAt: string | null
  } | null
} | null

function StatusDot({ status }: { status: "ok" | "warning" | "error" | "disabled" }) {
  const colors = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    disabled: "bg-[var(--c-gray-300)]",
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
}

function getSourceStatus(s: SourceHealth): "ok" | "warning" | "error" | "disabled" {
  if (!s.enabled) return "disabled"
  if (s.errorCount > 5) return "error"
  if (s.errorCount > 0) return "warning"
  return "ok"
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function TaxAuthorityOverviewClient({ data }: { data: OverviewData }) {
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; summary?: any; error?: string } | null>(null)

  async function handleFetchNow() {
    setFetching(true)
    setFetchResult(null)
    try {
      const res = await fetch("/api/admin/tax-authority/fetch-now", { method: "POST" })
      const json = await res.json()
      setFetchResult(json)
      if (json.ok) {
        // Reload page after short delay to show updated data
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch (e) {
      setFetchResult({ ok: false, error: e instanceof Error ? e.message : "Fetch failed" })
    } finally {
      setFetching(false)
    }
  }

  if (!data) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Tax Authority Conveyor tables may not be migrated yet. Run{" "}
        <code className="text-sm bg-amber-100 px-1 rounded">npx prisma migrate dev</code> to set up.
      </div>
    )
  }

  const { sources, ingestionSummary, benchmarkStats, latestDigest } = data

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
            Pippen — Tax Authority Conveyor
          </h1>
          <p className="text-[var(--c-gray-500)]">
            Source health, ingestion pipeline, authority management, and benchmark monitoring
          </p>
        </div>
        <button
          onClick={handleFetchNow}
          disabled={fetching}
          className="shrink-0 inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
          style={{
            background: fetching
              ? "var(--c-gray-400)"
              : "linear-gradient(135deg, rgba(196,154,60,0.9), rgba(196,154,60,0.75))",
            boxShadow: fetching ? "none" : "0 2px 8px rgba(196,154,60,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {fetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {fetching ? "Fetching..." : "Fetch Now"}
        </button>
      </div>

      {/* Fetch result banner */}
      {fetchResult && (
        <div className={`rounded-[12px] px-5 py-3 text-[13px] flex items-center gap-2 ${
          fetchResult.ok
            ? "bg-[var(--c-success-soft)] text-[var(--c-success)]"
            : "bg-[var(--c-danger-soft)] text-[var(--c-danger)]"
        }`} style={{ border: `1px solid ${fetchResult.ok ? "rgba(11,138,94,0.1)" : "rgba(217,48,37,0.1)"}` }}>
          {fetchResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {fetchResult.ok
            ? `Pippen fetched ${fetchResult.summary?.totalNew ?? 0} new, ${fetchResult.summary?.totalChanged ?? 0} changed items. Refreshing...`
            : `Fetch failed: ${fetchResult.error || "Unknown error"}`
          }
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { name: "Sources", href: "/admin/tax-authority/sources", icon: Database },
          { name: "Ingestion", href: "/admin/tax-authority/ingestion", icon: Download },
          { name: "Authorities", href: "/admin/tax-authority/authorities", icon: FileText },
          { name: "Benchmarks", href: "/admin/tax-authority/benchmarks", icon: BarChart3 },
          { name: "Digest", href: "/admin/tax-authority/digest", icon: Clock },
          { name: "Gap Report", href: "/admin/tax-authority/gaps", icon: AlertTriangle },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="p-3 rounded-lg border border-[var(--c-gray-200)] hover:border-[var(--c-teal)] hover:bg-[var(--c-gray-50)] transition-colors text-center"
          >
            <item.icon className="w-5 h-5 mx-auto mb-1 text-[var(--c-gray-500)]" />
            <span className="text-sm font-medium text-[var(--c-gray-700)]">{item.name}</span>
          </Link>
        ))}
      </div>

      {/* Source Health Cards */}
      <div>
        <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3">Source Health</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-[var(--c-gray-400)] italic">No sources registered</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sources.map((s) => {
              const status = getSourceStatus(s)
              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-lg border bg-white ${
                    status === "error"
                      ? "border-red-200"
                      : status === "warning"
                        ? "border-amber-200"
                        : "border-[var(--c-gray-200)]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StatusDot status={status} />
                    <span className="text-sm font-medium text-[var(--c-gray-900)] truncate">
                      {s.name}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-[var(--c-gray-500)]">
                    <p>Last fetch: {formatRelative(s.lastFetchedAt as any)}</p>
                    <p>
                      Errors:{" "}
                      <span
                        className={
                          s.errorCount > 0 ? "text-red-600 font-medium" : "text-[var(--c-gray-500)]"
                        }
                      >
                        {s.errorCount}
                      </span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Ingestion Summary */}
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white">
          <div className="flex items-center gap-2 text-[var(--c-gray-500)] mb-3">
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Today&apos;s Ingestion</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)] text-emerald-600">
                {ingestionSummary.newItems}
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">New</p>
            </div>
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)] text-blue-600">
                {ingestionSummary.changedItems}
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">Changed</p>
            </div>
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-500)]">
                {ingestionSummary.skippedItems}
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">Skipped</p>
            </div>
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)] text-red-600">
                {ingestionSummary.failedItems}
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">Failed</p>
            </div>
          </div>
          <p className="text-xs text-[var(--c-gray-400)] mt-2 text-center">
            {ingestionSummary.runsToday} runs today
          </p>
        </div>

        {/* Benchmark Scores */}
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white">
          <div className="flex items-center gap-2 text-[var(--c-gray-500)] mb-3">
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs font-medium">Benchmark Scores (7d)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)]">
                {(benchmarkStats.avgPrecision * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">Precision</p>
            </div>
            <div>
              <p className="text-lg font-[family-name:var(--font-jetbrains)]">
                {(benchmarkStats.avgRecall * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-[var(--c-gray-500)]">Recall</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 text-xs">
            {benchmarkStats.driftCount > 0 ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span className="text-amber-600">{benchmarkStats.driftCount} drifts detected</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-[var(--c-gray-500)]">No drift</span>
              </>
            )}
          </div>
        </div>

        {/* Latest Digest */}
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white">
          <div className="flex items-center gap-2 text-[var(--c-gray-500)] mb-3">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Latest Digest</span>
          </div>
          {latestDigest ? (
            <>
              <p className="text-xs text-[var(--c-gray-400)] mb-2">
                {new Date(latestDigest.digestDate).toLocaleDateString()}
                {latestDigest.publishedAt ? (
                  <span className="ml-2 text-emerald-600">Published</span>
                ) : (
                  <span className="ml-2 text-amber-600">Draft</span>
                )}
              </p>
              <p className="text-sm text-[var(--c-gray-700)] line-clamp-3">
                {latestDigest.summary}
              </p>
              <div className="flex gap-3 mt-2 text-xs text-[var(--c-gray-500)]">
                <span>+{latestDigest.newAuthorities} new</span>
                <span>{latestDigest.changedAuthorities} changed</span>
                <span>{latestDigest.supersededItems} superseded</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--c-gray-400)] italic">No digests yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
