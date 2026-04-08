"use client"

import { useState } from "react"
import {
  Database,
  RefreshCw,
  Power,
  PowerOff,
  AlertTriangle,
  Loader2,
  Play,
} from "lucide-react"

type Source = {
  id: string
  sourceId: string
  name: string
  description: string | null
  endpoint: string
  format: string
  cadence: string
  defaultTier: string
  enabled: boolean
  lastFetchedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  fetchCount: number
  errorCount: number
}

function tierBadgeColor(tier: string): string {
  if (tier.startsWith("A")) return "bg-emerald-100 text-emerald-700"
  if (tier.startsWith("B")) return "bg-blue-100 text-blue-700"
  if (tier.startsWith("C")) return "bg-amber-100 text-amber-700"
  if (tier.startsWith("D")) return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
  if (tier === "X") return "bg-red-100 text-red-700"
  return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString()
}

export function SourcesClient({ sources }: { sources: Source[] | null }) {
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  if (!sources) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Source registry table not available. Run migrations to set up.
      </div>
    )
  }

  async function handleToggle(sourceId: string, currentEnabled: boolean) {
    setActionLoading((prev) => ({ ...prev, [sourceId]: true }))
    try {
      await fetch(`/api/admin/tax-authority/sources/${sourceId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      })
      window.location.reload()
    } catch {
      // Silently fail - user can retry
    } finally {
      setActionLoading((prev) => ({ ...prev, [sourceId]: false }))
    }
  }

  async function handleForceHarvest(sourceId: string) {
    setActionLoading((prev) => ({ ...prev, [`harvest-${sourceId}`]: true }))
    try {
      await fetch(`/api/admin/tax-authority/sources/${sourceId}/harvest`, {
        method: "POST",
      })
      window.location.reload()
    } catch {
      // Silently fail
    } finally {
      setActionLoading((prev) => ({ ...prev, [`harvest-${sourceId}`]: false }))
    }
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
          Source Registry
        </h1>
        <p className="text-[var(--c-gray-500)]">
          Manage tax authority data sources and their harvest configuration
        </p>
      </div>

      <div className="border border-[var(--c-gray-200)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-gray-50)] border-b border-[var(--c-gray-200)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Source</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Endpoint</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Tier</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Last Fetched</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Fetches</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Errors</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--c-gray-400)] italic">
                    No sources registered yet
                  </td>
                </tr>
              )}
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--c-gray-100)] hover:bg-[var(--c-gray-50)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--c-gray-900)]">{s.name}</div>
                    <div className="text-xs text-[var(--c-gray-400)] font-[family-name:var(--font-jetbrains)]">
                      {s.sourceId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-[var(--c-gray-500)] font-[family-name:var(--font-jetbrains)] truncate block max-w-[200px]">
                      {s.endpoint}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tierBadgeColor(s.defaultTier)}`}
                    >
                      {s.defaultTier}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.enabled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--c-gray-400)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-gray-300)]" />
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--c-gray-500)]">
                    {formatDate(s.lastFetchedAt)}
                  </td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs">
                    {s.fetchCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-[family-name:var(--font-jetbrains)] text-xs ${
                        s.errorCount > 0 ? "text-red-600 font-medium" : "text-[var(--c-gray-500)]"
                      }`}
                    >
                      {s.errorCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggle(s.sourceId, s.enabled)}
                        disabled={actionLoading[s.sourceId]}
                        className="p-1.5 rounded hover:bg-[var(--c-gray-100)] transition-colors disabled:opacity-50"
                        title={s.enabled ? "Disable source" : "Enable source"}
                      >
                        {actionLoading[s.sourceId] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--c-gray-400)]" />
                        ) : s.enabled ? (
                          <Power className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <PowerOff className="w-3.5 h-3.5 text-[var(--c-gray-400)]" />
                        )}
                      </button>
                      <button
                        onClick={() => handleForceHarvest(s.sourceId)}
                        disabled={actionLoading[`harvest-${s.sourceId}`] || !s.enabled}
                        className="p-1.5 rounded hover:bg-[var(--c-gray-100)] transition-colors disabled:opacity-50"
                        title="Force harvest"
                      >
                        {actionLoading[`harvest-${s.sourceId}`] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--c-gray-400)]" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-[var(--c-teal)]" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Details */}
      {sources.filter((s) => s.lastError).length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-3">Recent Errors</h2>
          <div className="space-y-2">
            {sources
              .filter((s) => s.lastError)
              .map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm"
                >
                  <span className="font-medium text-red-700">{s.name}:</span>{" "}
                  <span className="text-red-600">{s.lastError}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
