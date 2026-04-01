"use client"

import { useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

type BenchmarkRow = {
  id: string
  question: string
  expectedCitations: string[]
  expectedTier: string | null
  issueCluster: string | null
  latestRun: {
    id: string
    runDate: string
    citationPrecision: number
    citationRecall: number
    topTierMatch: boolean
    answerQuality: number | null
    driftDetected: boolean
    retrievedCitations: string[]
  } | null
}

function scoreColor(score: number): string {
  if (score >= 0.75) return "text-emerald-600"
  if (score >= 0.5) return "text-amber-600"
  return "text-red-600"
}

function scoreBgColor(score: number): string {
  if (score >= 0.75) return "bg-emerald-100 text-emerald-700"
  if (score >= 0.5) return "bg-amber-100 text-amber-700"
  return "bg-red-100 text-red-700"
}

export function BenchmarksClient({ benchmarks }: { benchmarks: BenchmarkRow[] | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runningBenchmarks, setRunningBenchmarks] = useState(false)

  if (!benchmarks) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Benchmark tables not available. Run migrations to set up.
      </div>
    )
  }

  const totalQuestions = benchmarks.length
  const withRuns = benchmarks.filter((b) => b.latestRun)
  const avgPrecision = withRuns.length > 0
    ? withRuns.reduce((sum, b) => sum + (b.latestRun?.citationPrecision ?? 0), 0) / withRuns.length
    : 0
  const avgRecall = withRuns.length > 0
    ? withRuns.reduce((sum, b) => sum + (b.latestRun?.citationRecall ?? 0), 0) / withRuns.length
    : 0
  const driftCount = withRuns.filter((b) => b.latestRun?.driftDetected).length

  async function handleRunBenchmarks() {
    setRunningBenchmarks(true)
    try {
      await fetch("/api/admin/tax-authority/benchmarks/run", { method: "POST" })
      window.location.reload()
    } catch {
      // Silently fail
    } finally {
      setRunningBenchmarks(false)
    }
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
            Benchmark Results
          </h1>
          <p className="text-[var(--c-gray-500)]">
            Citation retrieval quality benchmarks and drift detection
          </p>
        </div>
        <button
          onClick={handleRunBenchmarks}
          disabled={runningBenchmarks}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm bg-[var(--c-teal)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {runningBenchmarks ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run Benchmarks
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white text-center">
          <p className="text-2xl font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-900)]">
            {totalQuestions}
          </p>
          <p className="text-xs text-[var(--c-gray-500)]">Questions</p>
        </div>
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white text-center">
          <p className="text-2xl font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-900)]">
            {withRuns.length}
          </p>
          <p className="text-xs text-[var(--c-gray-500)]">With Runs</p>
        </div>
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white text-center">
          <p className={`text-2xl font-[family-name:var(--font-jetbrains)] ${scoreColor(avgPrecision)}`}>
            {(avgPrecision * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-[var(--c-gray-500)]">Avg Precision</p>
        </div>
        <div className="p-4 rounded-lg border border-[var(--c-gray-200)] bg-white text-center">
          <p className={`text-2xl font-[family-name:var(--font-jetbrains)] ${scoreColor(avgRecall)}`}>
            {(avgRecall * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-[var(--c-gray-500)]">Avg Recall</p>
        </div>
        <div className={`p-4 rounded-lg border bg-white text-center ${driftCount > 0 ? "border-amber-300" : "border-[var(--c-gray-200)]"}`}>
          <p className={`text-2xl font-[family-name:var(--font-jetbrains)] ${driftCount > 0 ? "text-amber-600" : "text-[var(--c-gray-900)]"}`}>
            {driftCount}
          </p>
          <p className="text-xs text-[var(--c-gray-500)]">Drifts</p>
        </div>
      </div>

      {/* Benchmark Table */}
      <div className="border border-[var(--c-gray-200)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-gray-50)] border-b border-[var(--c-gray-200)]">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Question</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Cluster</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--c-gray-600)]">Precision</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--c-gray-600)]">Recall</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--c-gray-600)]">Quality</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--c-gray-600)]">Drift</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--c-gray-400)] italic">
                    No benchmark questions configured
                  </td>
                </tr>
              )}
              {benchmarks.map((b) => {
                const run = b.latestRun
                return (
                  <>
                    <tr
                      key={b.id}
                      className="border-b border-[var(--c-gray-100)] hover:bg-[var(--c-gray-50)] transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                    >
                      <td className="px-2 py-3 text-[var(--c-gray-400)]">
                        {expandedId === b.id ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[var(--c-gray-900)] line-clamp-1">{b.question}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--c-gray-500)]">
                        {b.issueCluster ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {run ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-[family-name:var(--font-jetbrains)] ${scoreBgColor(run.citationPrecision)}`}>
                            {(run.citationPrecision * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--c-gray-400)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {run ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-[family-name:var(--font-jetbrains)] ${scoreBgColor(run.citationRecall)}`}>
                            {(run.citationRecall * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--c-gray-400)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {run?.answerQuality != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-[family-name:var(--font-jetbrains)] ${scoreBgColor(run.answerQuality)}`}>
                            {(run.answerQuality * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--c-gray-400)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {run ? (
                          run.driftDetected ? (
                            <TrendingDown className="w-4 h-4 text-amber-500 mx-auto" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          )
                        ) : (
                          <span className="text-xs text-[var(--c-gray-400)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--c-gray-500)]">
                        {run ? new Date(run.runDate).toLocaleDateString() : "Never"}
                      </td>
                    </tr>
                    {expandedId === b.id && (
                      <tr key={`${b.id}-detail`} className="border-b border-[var(--c-gray-100)]">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="p-4 rounded bg-[var(--c-gray-50)] border border-[var(--c-gray-200)] space-y-3">
                            <div>
                              <p className="text-xs font-medium text-[var(--c-gray-600)] mb-1">
                                Expected Citations
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {b.expectedCitations.map((c, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-[family-name:var(--font-jetbrains)]"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {run && (
                              <div>
                                <p className="text-xs font-medium text-[var(--c-gray-600)] mb-1">
                                  Retrieved Citations
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {run.retrievedCitations.length > 0 ? (
                                    run.retrievedCitations.map((c, i) => {
                                      const isExpected = b.expectedCitations.some(
                                        (e) => e.toLowerCase() === c.toLowerCase()
                                      )
                                      return (
                                        <span
                                          key={i}
                                          className={`inline-block px-2 py-0.5 rounded text-xs font-[family-name:var(--font-jetbrains)] ${
                                            isExpected
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
                                          }`}
                                        >
                                          {c}
                                          {isExpected && (
                                            <CheckCircle2 className="w-3 h-3 inline ml-1" />
                                          )}
                                        </span>
                                      )
                                    })
                                  ) : (
                                    <span className="text-xs text-[var(--c-gray-400)] italic">
                                      No citations retrieved
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {b.expectedTier && (
                              <p className="text-xs text-[var(--c-gray-500)]">
                                Expected Tier: <span className="font-medium">{b.expectedTier}</span>
                                {run?.topTierMatch && (
                                  <CheckCircle2 className="w-3 h-3 inline ml-1 text-emerald-500" />
                                )}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
