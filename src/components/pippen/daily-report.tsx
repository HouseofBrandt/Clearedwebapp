"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Library,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ExternalLink,
  Star,
} from "lucide-react"
import { PippenIcon } from "./pippen-icon"
import { getPippenMessage, getPippenEmptyMessage, PIPPEN_EMPTY_STATE } from "@/lib/pippen/loading-messages"
import type { PippenMood } from "./pippen-icon"
import type { PippenDailyReport, PippenAlert, CaseDocumentGroup, LearningItem, LearningsSection } from "@/lib/pippen/daily-intake-report"

const GOLD = "var(--c-gold, #C49A3C)"

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0]
}

// ---- Stat Card ----

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  accent?: string
}) {
  return (
    <div
      className="rounded-[14px] border border-[var(--c-gray-100)] bg-white p-5"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: accent || "var(--c-gray-400)" }} />
        <span className="text-xs font-medium text-[var(--c-gray-500)]">{label}</span>
      </div>
      <p
        className="text-2xl font-[family-name:var(--font-jetbrains)]"
        style={{ color: accent || "var(--c-gray-900)" }}
      >
        {value}
      </p>
    </div>
  )
}

// ---- Alert Item ----

function AlertItem({ alert }: { alert: PippenAlert }) {
  const icons = {
    critical: AlertTriangle,
    warning: AlertCircle,
    info: Info,
  }
  const colors = {
    critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "text-red-500" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "text-amber-500" },
    info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "text-blue-500" },
  }
  const c = colors[alert.severity]
  const Icon = icons[alert.severity]

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${c.bg} ${c.border}`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${c.icon}`} />
      <div>
        <p className={`text-sm ${c.text}`}>{alert.message}</p>
        {alert.caseNumber && (
          <p className="text-xs text-[var(--c-gray-500)] mt-0.5">Case: {alert.caseNumber}</p>
        )}
      </div>
    </div>
  )
}

// ---- Case Group ----

function CaseGroupCard({ group }: { group: CaseDocumentGroup }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-[var(--c-gray-200)] rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--c-gray-50)] transition-colors text-left"
      >
        <FolderOpen className="w-4 h-4 text-[var(--c-gray-400)]" />
        <span className="text-sm font-medium text-[var(--c-gray-900)]">{group.caseNumber}</span>
        <span className="text-xs text-[var(--c-gray-500)]">{group.clientName}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-[var(--c-gray-400)]">
          {group.documents.length} doc{group.documents.length !== 1 ? "s" : ""}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--c-gray-100)] divide-y divide-[var(--c-gray-100)]">
          {group.documents.map((doc) => (
            <div key={doc.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <FileText className="w-3.5 h-3.5 text-[var(--c-gray-400)]" />
              <span className="text-[var(--c-gray-800)] truncate flex-1">{doc.fileName}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-gray-100)] text-[var(--c-gray-600)]">
                {doc.documentCategory.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-[var(--c-gray-400)]">{doc.uploaderName}</span>
              {doc.hasExtractedText ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Learning Item Card ----

function LearningItemCard({ learning }: { learning: LearningItem }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-[var(--c-gray-200)] rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--c-gray-50)] transition-colors text-left"
      >
        <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--c-gray-900)] block">{learning.title}</span>
          <span className="text-xs text-[var(--c-gray-500)] block mt-0.5 truncate">{learning.source}</span>
        </div>
        <span className="flex items-center gap-1 text-xs text-[var(--c-gray-400)] flex-shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--c-gray-100)] px-4 py-3 space-y-2">
          <p className="text-sm text-[var(--c-gray-700)]">{learning.summary}</p>
          <p className="text-sm text-[var(--c-gray-600)]">
            <span className="font-medium">Why it matters:</span> {learning.relevance}
          </p>
          {learning.actionItems && learning.actionItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--c-gray-600)] mb-1">Action items:</p>
              <ul className="list-disc list-inside text-sm text-[var(--c-gray-600)] space-y-0.5">
                {learning.actionItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            {learning.sourceUrl && (
              <a
                href={learning.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                style={{ color: GOLD }}
              >
                <ExternalLink className="w-3 h-3" />
                View source
              </a>
            )}
            {learning.publicationDate && (
              <span className="text-xs text-[var(--c-gray-400)]">Published: {learning.publicationDate}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main Component ----

export function PippenDailyReportView() {
  const [date, setDate] = useState(() => toDateString(new Date()))
  const [report, setReport] = useState<PippenDailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(() => getPippenMessage("harvesting"))
  const [mood, setMood] = useState<PippenMood>("fetching")

  const fetchReport = useCallback(async (dateStr: string) => {
    setLoading(true)
    setError(null)
    setMood("fetching")
    setLoadingMessage(getPippenMessage("harvesting"))

    try {
      // Cycle through phases for visual feedback
      const phaseTimer1 = setTimeout(() => setLoadingMessage(getPippenMessage("processing")), 1500)
      const phaseTimer2 = setTimeout(() => setLoadingMessage(getPippenMessage("compiling")), 3000)

      const res = await fetch(`/api/pippen/daily-report?date=${dateStr}`)
      clearTimeout(phaseTimer1)
      clearTimeout(phaseTimer2)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to fetch report (${res.status})`)
      }

      const data: PippenDailyReport = await res.json()
      setReport(data)
      setMood("delivered")
      setLoadingMessage(getPippenMessage("complete"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch report")
      setMood("idle")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReport(date)
  }, [date, fetchReport])

  function navigateDate(delta: number) {
    const current = new Date(date + "T00:00:00")
    current.setDate(current.getDate() + delta)
    setDate(toDateString(current))
  }

  const isToday = date === toDateString(new Date())
  const isEmpty = report && report.totalDocuments === 0 && !report.authorityDigest.available

  return (
    <div className="page-enter space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <PippenIcon mood={loading ? "fetching" : mood} size={48} style={{ color: GOLD } as React.CSSProperties} />
        <div className="flex-1">
          <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
            Pippen&apos;s Daily Report
          </h1>
          <p className="text-[var(--c-gray-500)]">
            What Pippen fetched today — documents, authorities, and alerts
          </p>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="p-2 rounded-lg border border-[var(--c-gray-200)] hover:bg-[var(--c-gray-50)] transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-4 h-4 text-[var(--c-gray-600)]" />
        </button>
        <span className="text-sm font-medium text-[var(--c-gray-900)] min-w-[220px] text-center">
          {formatDate(date)}
          {isToday && (
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${GOLD}20`, color: GOLD }}
            >
              Today
            </span>
          )}
        </span>
        <button
          onClick={() => navigateDate(1)}
          disabled={isToday}
          className="p-2 rounded-lg border border-[var(--c-gray-200)] hover:bg-[var(--c-gray-50)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next day"
        >
          <ChevronRight className="w-4 h-4 text-[var(--c-gray-600)]" />
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <PippenIcon mood="fetching" size={80} style={{ color: GOLD } as React.CSSProperties} />
          <p className="text-sm text-[var(--c-gray-500)] animate-pulse">{loadingMessage}</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-center">
          <PippenIcon mood="idle" size={56} className="mx-auto mb-3" style={{ color: "var(--c-gray-400)" } as React.CSSProperties} />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => fetchReport(date)}
            className="mt-3 text-sm font-medium px-4 py-2 rounded-lg bg-[var(--c-gray-900)] text-white hover:bg-[var(--c-gray-800)] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <PippenIcon mood="idle" size={72} style={{ color: "var(--c-gray-300)" } as React.CSSProperties} />
          <div className="text-center">
            <h2 className="text-lg font-medium text-[var(--c-gray-600)]">{PIPPEN_EMPTY_STATE.title}</h2>
            <p className="text-sm text-[var(--c-gray-400)] mt-1">{getPippenEmptyMessage()}</p>
          </div>
        </div>
      )}

      {/* Report Content */}
      {report && !loading && !error && !isEmpty && (
        <>
          {/* Top Takeaway */}
          {report.learnings?.available && report.learnings.topTakeaway && (
            <div
              className="rounded-[14px] border-2 p-5 flex items-start gap-3"
              style={{ borderColor: GOLD, backgroundColor: `${GOLD}08` }}
            >
              <Star className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
              <div>
                <h2 className="text-sm font-medium text-[var(--c-gray-900)] mb-1">Top Takeaway</h2>
                <p className="text-sm text-[var(--c-gray-700)]">{report.learnings.topTakeaway}</p>
              </div>
            </div>
          )}

          {/* Alerts */}
          {report.alerts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-[var(--c-gray-900)]">Alerts</h2>
              {report.alerts.map((alert, i) => (
                <AlertItem key={i} alert={alert} />
              ))}
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Documents"
              value={report.totalDocuments}
              icon={FileText}
              accent={GOLD}
            />
            <StatCard
              label="Cases Affected"
              value={report.totalCasesAffected}
              icon={FolderOpen}
              accent="var(--c-teal, #2A9D8F)"
            />
            <StatCard
              label="New Authorities"
              value={report.authorityDigest.newAuthorities}
              icon={Library}
              accent={report.authorityDigest.available ? "#16a34a" : "var(--c-gray-300)"}
            />
            <StatCard
              label="Deadlines Found"
              value={report.alerts.filter((a) => a.type === "deadline").length}
              icon={Clock}
              accent="#dc2626"
            />
          </div>

          {/* Client Intake Section */}
          {report.caseGroups.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--c-gray-900)]">
                Client Document Intake
              </h2>
              {report.caseGroups.map((group) => (
                <CaseGroupCard key={group.caseId} group={group} />
              ))}
            </div>
          )}

          {/* Authority Harvesting Section */}
          {report.authorityDigest.available && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--c-gray-900)]">
                Authority Harvesting
              </h2>
              <div className="rounded-[14px] border border-[var(--c-gray-100)] bg-white p-5" style={{ boxShadow: "var(--shadow-1)" }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-lg font-[family-name:var(--font-jetbrains)] text-emerald-600">
                      {report.authorityDigest.newAuthorities}
                    </p>
                    <p className="text-xs text-[var(--c-gray-500)]">New</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-[family-name:var(--font-jetbrains)] text-blue-600">
                      {report.authorityDigest.changedAuthorities}
                    </p>
                    <p className="text-xs text-[var(--c-gray-500)]">Changed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-[family-name:var(--font-jetbrains)] text-[var(--c-gray-600)]">
                      {report.authorityDigest.supersededItems}
                    </p>
                    <p className="text-xs text-[var(--c-gray-500)]">Superseded</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-[family-name:var(--font-jetbrains)] text-amber-600">
                      {report.authorityDigest.benchmarkDrifts}
                    </p>
                    <p className="text-xs text-[var(--c-gray-500)]">Drifts</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Today's Learnings */}
          {report.learnings?.available && report.learnings.learnings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--c-gray-900)]">
                Today&apos;s Learnings
              </h2>
              {report.learnings.learnings.map((learning, i) => (
                <LearningItemCard key={i} learning={learning} />
              ))}
            </div>
          )}

          {/* Extraction Quality */}
          {report.extractionQuality.total > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--c-gray-900)]">Extraction Quality</h2>
              <div className="rounded-[14px] border border-[var(--c-gray-100)] bg-white p-5" style={{ boxShadow: "var(--shadow-1)" }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-[var(--c-gray-100)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${report.extractionQuality.extractionRate * 100}%`,
                          backgroundColor: GOLD,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-[family-name:var(--font-jetbrains)]" style={{ color: GOLD }}>
                    {(report.extractionQuality.extractionRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-[var(--c-gray-500)]">
                  <span>{report.extractionQuality.withText} with text</span>
                  <span>{report.extractionQuality.withoutText} without text</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
