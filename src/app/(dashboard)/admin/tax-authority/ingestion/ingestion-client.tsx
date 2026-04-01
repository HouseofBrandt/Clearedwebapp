"use client"

import { useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

type IngestionRunRow = {
  id: string
  sourceName: string
  sourceId: string
  status: string
  startedAt: string
  completedAt: string | null
  itemsFetched: number
  itemsNew: number
  itemsChanged: number
  itemsSkipped: number
  itemsFailed: number
  errorLog: string | null
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "COMPLETE":
      return "bg-emerald-100 text-emerald-700"
    case "FAILED":
      return "bg-red-100 text-red-700"
    case "FETCHING":
    case "PARSING":
    case "CHUNKING":
    case "EMBEDDING":
      return "bg-blue-100 text-blue-700"
    case "PENDING":
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
    case "SKIPPED":
      return "bg-amber-100 text-amber-700"
    default:
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Running..."
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export function IngestionClient({ runs }: { runs: IngestionRunRow[] | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!runs) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Ingestion runs table not available. Run migrations to set up.
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
          Ingestion Runs
        </h1>
        <p className="text-[var(--c-gray-500)]">
          History of source harvesting and ingestion pipeline runs
        </p>
      </div>

      <div className="border border-[var(--c-gray-200)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-gray-50)] border-b border-[var(--c-gray-200)]">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Source</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Started</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Duration</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Fetched</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">New</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Changed</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Failed</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--c-gray-400)] italic">
                    No ingestion runs recorded yet
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <>
                  <tr
                    key={run.id}
                    className="border-b border-[var(--c-gray-100)] hover:bg-[var(--c-gray-50)] transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedId(expandedId === run.id ? null : run.id)
                    }
                  >
                    <td className="px-2 py-3 text-[var(--c-gray-400)]">
                      {run.errorLog ? (
                        expandedId === run.id ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--c-gray-900)]">{run.sourceName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeColor(run.status)}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--c-gray-500)]">
                      {formatDate(run.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--c-gray-500)] font-[family-name:var(--font-jetbrains)]">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs">
                      {run.itemsFetched}
                    </td>
                    <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs text-emerald-600">
                      {run.itemsNew}
                    </td>
                    <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs text-blue-600">
                      {run.itemsChanged}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-[family-name:var(--font-jetbrains)] text-xs ${
                          run.itemsFailed > 0 ? "text-red-600 font-medium" : "text-[var(--c-gray-500)]"
                        }`}
                      >
                        {run.itemsFailed}
                      </span>
                    </td>
                  </tr>
                  {expandedId === run.id && run.errorLog && (
                    <tr key={`${run.id}-error`} className="border-b border-[var(--c-gray-100)]">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="p-3 rounded bg-red-50 border border-red-200">
                          <p className="text-xs font-medium text-red-700 mb-1">Error Log</p>
                          <pre className="text-xs text-red-600 whitespace-pre-wrap font-[family-name:var(--font-jetbrains)] max-h-48 overflow-y-auto">
                            {run.errorLog}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
