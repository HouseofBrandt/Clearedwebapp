"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react"

type DigestRow = {
  id: string
  digestDate: string
  newAuthorities: number
  changedAuthorities: number
  supersededItems: number
  benchmarkDrifts: number
  knowledgeGaps: number
  summary: string
  details: Record<string, unknown>
  publishedAt: string | null
}

export function DigestClient({ digests }: { digests: DigestRow[] | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!digests) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Daily digest table not available. Run migrations to set up.
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
          Daily Digests
        </h1>
        <p className="text-[var(--c-gray-500)]">
          Daily summaries of authority changes, benchmark results, and knowledge gaps
        </p>
      </div>

      {digests.length === 0 ? (
        <div className="p-8 rounded-lg border border-[var(--c-gray-200)] bg-white text-center">
          <FileText className="w-8 h-8 text-[var(--c-gray-300)] mx-auto mb-3" />
          <p className="text-sm text-[var(--c-gray-400)]">No digests generated yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {digests.map((d) => {
            const isExpanded = expandedId === d.id
            const date = new Date(d.digestDate)

            return (
              <div
                key={d.id}
                className="border border-[var(--c-gray-200)] rounded-lg bg-white overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[var(--c-gray-50)] transition-colors text-left"
                >
                  <span className="text-[var(--c-gray-400)]">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Calendar className="w-3.5 h-3.5 text-[var(--c-gray-400)]" />
                    <span className="text-sm font-medium text-[var(--c-gray-900)]">
                      {date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--c-gray-500)]">
                    <span className="text-emerald-600">+{d.newAuthorities} new</span>
                    <span className="text-blue-600">{d.changedAuthorities} changed</span>
                    <span>{d.supersededItems} superseded</span>
                    {d.benchmarkDrifts > 0 && (
                      <span className="text-amber-600">{d.benchmarkDrifts} drifts</span>
                    )}
                    {d.knowledgeGaps > 0 && (
                      <span className="text-red-600">{d.knowledgeGaps} gaps</span>
                    )}
                  </div>
                  <span className="ml-auto">
                    {d.publishedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Published
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Draft
                      </span>
                    )}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-[var(--c-gray-200)] px-4 py-4 space-y-4">
                    {/* Stats Row */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      <StatBox label="New Authorities" value={d.newAuthorities} color="emerald" />
                      <StatBox label="Changed" value={d.changedAuthorities} color="blue" />
                      <StatBox label="Superseded" value={d.supersededItems} color="gray" />
                      <StatBox label="Benchmark Drifts" value={d.benchmarkDrifts} color="amber" />
                      <StatBox label="Knowledge Gaps" value={d.knowledgeGaps} color="red" />
                    </div>

                    {/* Summary */}
                    <div>
                      <p className="text-xs font-medium text-[var(--c-gray-600)] mb-2">Summary</p>
                      <div className="p-4 rounded bg-[var(--c-gray-50)] border border-[var(--c-gray-200)]">
                        <div className="prose prose-sm max-w-none text-[var(--c-gray-700)] whitespace-pre-wrap text-sm leading-relaxed">
                          {d.summary}
                        </div>
                      </div>
                    </div>

                    {/* Details (raw JSON) */}
                    {d.details && Object.keys(d.details).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[var(--c-gray-600)] mb-2">
                          Details
                        </p>
                        <pre className="p-4 rounded bg-[var(--c-gray-50)] border border-[var(--c-gray-200)] text-xs font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-600)] overflow-x-auto max-h-64 overflow-y-auto">
                          {JSON.stringify(d.details, null, 2)}
                        </pre>
                      </div>
                    )}

                    {d.publishedAt && (
                      <p className="text-xs text-[var(--c-gray-400)]">
                        Published at {new Date(d.publishedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: "emerald" | "blue" | "amber" | "red" | "gray"
}) {
  const valueColors = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    red: "text-red-600",
    gray: "text-[var(--c-gray-600)]",
  }

  return (
    <div className="text-center p-2 rounded bg-[var(--c-gray-50)]">
      <p className={`text-lg font-[family-name:var(--font-jetbrains)] ${valueColors[color]}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--c-gray-500)]">{label}</p>
    </div>
  )
}
