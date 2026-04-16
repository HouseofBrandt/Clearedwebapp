import Link from "next/link"
import { prisma } from "@/lib/db"
import { AlertTriangle, AlertCircle, Clock, CheckCircle2, ArrowLeft, RefreshCw } from "lucide-react"

export const dynamic = "force-dynamic"

interface GapItem {
  type: "correction" | "missing_citation" | "stale_citation" | "benchmark_drift"
  description: string
  issueArea?: string
}

interface GapReportData {
  corrections: number
  missingCitations: number
  staleCitations: number
  benchmarkDrifts: number
  gaps: GapItem[]
  error?: string
}

async function loadLatestGapReport(): Promise<{
  report: GapReportData | null
  scannedAt: string | null
  priorReport: GapReportData | null
  priorScannedAt: string | null
}> {
  try {
    const recent = await prisma.auditLog.findMany({
      where: { action: "AUTHORITY_GAP_SCAN" },
      orderBy: { timestamp: "desc" },
      take: 2,
      select: { timestamp: true, metadata: true },
    })

    const toReport = (entry?: { metadata: unknown }): GapReportData | null => {
      if (!entry?.metadata || typeof entry.metadata !== "object") return null
      return entry.metadata as GapReportData
    }

    return {
      report: toReport(recent[0]),
      scannedAt: recent[0]?.timestamp.toISOString() ?? null,
      priorReport: toReport(recent[1]),
      priorScannedAt: recent[1]?.timestamp.toISOString() ?? null,
    }
  } catch (err) {
    console.error("[gaps page] failed to load gap reports:", err)
    return { report: null, scannedAt: null, priorReport: null, priorScannedAt: null }
  }
}

export default async function GapsPage() {
  const { report, scannedAt, priorReport, priorScannedAt } = await loadLatestGapReport()

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link
          href="/admin/tax-authority"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tax Authority
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Gap Report</span>
      </div>

      {/* Header */}
      <div>
        <h1
          className="tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400 }}
        >
          Gap Report
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Weekly scan of the authority knowledge base for drift, stale citations,
          and missing coverage. Produced by <code className="text-[12px]">scanForGaps()</code>.
        </p>
      </div>

      {/* Last scan timestamp + cron hint */}
      <div
        className="flex items-center justify-between rounded-[10px] border border-[var(--c-gray-100)] bg-white px-4 py-3"
      >
        <div className="flex items-center gap-2.5 text-[13px]">
          <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          {scannedAt ? (
            <>
              <span className="text-muted-foreground">Last scan:</span>
              <span className="font-medium tabular-nums">
                {new Date(scannedAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground italic">
              No scans yet. Cron runs weekly; trigger manually via{" "}
              <code className="text-[12px]">/api/cron/tax-authority/weekly-gaps</code>.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          Weekly cron
        </div>
      </div>

      {/* Summary cards */}
      {report ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Corrections"
            count={report.corrections}
            prior={priorReport?.corrections}
            tone="danger"
          />
          <SummaryCard
            label="Missing citations"
            count={report.missingCitations}
            prior={priorReport?.missingCitations}
            tone="warning"
          />
          <SummaryCard
            label="Stale citations"
            count={report.staleCitations}
            prior={priorReport?.staleCitations}
            tone="warning"
          />
          <SummaryCard
            label="Benchmark drifts"
            count={report.benchmarkDrifts}
            prior={priorReport?.benchmarkDrifts}
            tone="info"
          />
        </div>
      ) : (
        <div
          className="rounded-[12px] border border-dashed border-[var(--c-gray-200)] bg-[var(--c-gray-50)]/50 p-8 text-center"
        >
          <AlertCircle
            className="mx-auto h-8 w-8 text-muted-foreground/40"
            strokeWidth={1.25}
          />
          <h3 className="mt-3 text-[14px] font-medium tracking-[-0.01em]">
            No gap report yet
          </h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground max-w-md mx-auto">
            The weekly gap scan has not run yet, or its result could not be read.
            Trigger the cron manually with the <code>CRON_SECRET</code> header.
          </p>
        </div>
      )}

      {/* Gap list */}
      {report && report.gaps.length > 0 && (
        <div className="rounded-[12px] border border-[var(--c-gray-100)] bg-white overflow-hidden">
          <div
            className="px-5 py-3.5 border-b border-[var(--c-gray-100)] flex items-center justify-between"
          >
            <h2 className="text-[14px] font-medium tracking-[-0.01em]">
              Individual gaps
            </h2>
            <span
              className="text-[11px] font-mono uppercase tracking-[0.04em] text-muted-foreground"
            >
              {report.gaps.length} {report.gaps.length === 1 ? "item" : "items"}
            </span>
          </div>
          <ul className="divide-y divide-[var(--c-gray-100)]/60">
            {report.gaps.map((gap, i) => (
              <li key={i} className="px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <GapIcon type={gap.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.04em] text-muted-foreground mb-0.5">
                      <span>{formatGapType(gap.type)}</span>
                      {gap.issueArea && (
                        <>
                          <span>·</span>
                          <span>{gap.issueArea}</span>
                        </>
                      )}
                    </div>
                    <p className="text-[13.5px] text-[var(--c-gray-800)]">
                      {gap.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clean-bill-of-health state */}
      {report && report.gaps.length === 0 && !report.error && (
        <div
          className="rounded-[12px] border border-[var(--c-success)]/20 bg-[var(--c-success-soft)] p-6 text-center"
        >
          <CheckCircle2
            className="mx-auto h-8 w-8 text-[var(--c-success)]"
            strokeWidth={1.25}
          />
          <h3 className="mt-3 text-[14px] font-medium tracking-[-0.01em] text-[var(--c-success)]">
            No gaps detected
          </h3>
          <p className="mt-1 text-[12.5px] text-[var(--c-success)]/80">
            The latest scan found no corrections, missing citations, stale
            authorities, or benchmark drifts.
          </p>
        </div>
      )}

      {/* Error banner (if the last scan failed) */}
      {report?.error && (
        <div
          className="rounded-[12px] border border-[var(--c-danger)]/30 bg-[var(--c-danger-soft)] p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-4 w-4 text-[var(--c-danger)] mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--c-danger)]">
              Last scan returned an error
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--c-danger)]/80">
              {report.error}
            </p>
          </div>
        </div>
      )}

      {/* Prior scan delta hint */}
      {priorScannedAt && (
        <p className="text-[11px] text-muted-foreground italic">
          Prior scan:{" "}
          {new Date(priorScannedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  count,
  prior,
  tone,
}: {
  label: string
  count: number
  prior?: number
  tone: "danger" | "warning" | "info"
}) {
  const toneBorder = {
    danger: "border-[var(--c-danger)]/20",
    warning: "border-[var(--c-warning)]/20",
    info: "border-[var(--c-gray-100)]",
  }[tone]

  const toneText = {
    danger: "text-[var(--c-danger)]",
    warning: "text-[var(--c-warning)]",
    info: "text-[var(--c-gray-800)]",
  }[tone]

  const delta =
    typeof prior === "number" && prior !== count ? count - prior : null
  const deltaLabel =
    delta == null ? null : delta > 0 ? `+${delta} since last week` : `${delta} since last week`

  return (
    <div className={`rounded-[10px] border ${toneBorder} bg-white p-4`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 ${toneText}`}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </p>
      {deltaLabel && (
        <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          {deltaLabel}
        </p>
      )}
    </div>
  )
}

function GapIcon({ type }: { type: GapItem["type"] }) {
  const iconClass = "h-4 w-4 mt-0.5 shrink-0"
  switch (type) {
    case "correction":
      return <AlertTriangle className={`${iconClass} text-[var(--c-danger)]`} strokeWidth={1.5} />
    case "missing_citation":
      return <AlertCircle className={`${iconClass} text-[var(--c-warning)]`} strokeWidth={1.5} />
    case "stale_citation":
      return <Clock className={`${iconClass} text-[var(--c-warning)]`} strokeWidth={1.5} />
    case "benchmark_drift":
      return <AlertCircle className={`${iconClass} text-[var(--c-gray-500)]`} strokeWidth={1.5} />
  }
}

function formatGapType(type: GapItem["type"]): string {
  switch (type) {
    case "correction":
      return "Correction"
    case "missing_citation":
      return "Missing Citation"
    case "stale_citation":
      return "Stale Citation"
    case "benchmark_drift":
      return "Benchmark Drift"
  }
}
