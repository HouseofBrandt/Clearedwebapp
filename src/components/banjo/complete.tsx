"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CountUp } from "@/components/ui/count-up"
import { BanjoIcon } from "./banjo-icon"
import Link from "next/link"
import { AlertTriangle, FileText, Download, Shield, Loader2 } from "lucide-react"

interface CompletedTask {
  step: number
  label: string
  taskId: string
  format: string
  verifyFlagCount: number
  judgmentFlagCount: number
}

interface BanjoCompleteProps {
  tasks: CompletedTask[]
  totalTimeSeconds: number
  model: string
  failedSteps?: number[]
  skippedSteps?: number[]
  revisionStatus?: "complete" | "failed" | "skipped" | "not_run"
  revisionSummary?: string
  revisedCount?: number
  assignmentId?: string
}

const NOTE_SYMBOLS = ["\u266A", "\u266B", "\u266C", "\u2669"]

function NoteParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {NOTE_SYMBOLS.map((note, i) => (
        <span
          key={i}
          className="banjo-note-particle"
          style={{
            left: `${20 + i * 15}%`,
            top: "50%",
            "--note-x": `${(i % 2 === 0 ? 1 : -1) * (8 + i * 6)}px`,
            "--note-r": `${(i % 2 === 0 ? 1 : -1) * (10 + i * 8)}deg`,
            animationDelay: `${i * 120}ms`,
            color: "var(--c-gold, #C49A3C)",
            opacity: 0.7,
          } as React.CSSProperties}
        >
          {note}
        </span>
      ))}
    </div>
  )
}

export function BanjoComplete({ tasks, totalTimeSeconds, model, failedSteps = [], skippedSteps = [], revisionStatus = "not_run", revisionSummary, revisedCount = 0, assignmentId }: BanjoCompleteProps) {
  const [showParticles, setShowParticles] = useState(true)
  const [celebrating, setCelebrating] = useState(true)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    if (!assignmentId) return

    // Run pre-export validation first
    setValidating(true)
    setValidationResult(null)
    try {
      const valRes = await fetch(`/api/banjo/${assignmentId}/validate`)
      if (valRes.ok) {
        const result = await valRes.json()
        setValidationResult(result)

        if (!result.valid) {
          setValidating(false)
          return // Show errors, don't export
        }
      }
    } catch { /* continue with export if validation endpoint fails */ }
    setValidating(false)

    // Proceed with export
    setExporting(true)
    try {
      const res = await fetch(`/api/banjo/${assignmentId}/export-zip?skipValidation=true`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }))
        setValidationResult({ valid: false, errors: [{ stepLabel: "Export", errors: [err.error], severity: "error" }], warnings: [] })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `banjo_export.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setValidationResult({ valid: false, errors: [{ stepLabel: "Export", errors: [err.message], severity: "error" }], warnings: [] })
    } finally {
      setExporting(false)
    }
  }, [assignmentId])

  useEffect(() => {
    // End celebration after animation completes
    const timer1 = setTimeout(() => setShowParticles(false), 1200)
    const timer2 = setTimeout(() => setCelebrating(false), 1000)
    return () => { clearTimeout(timer1); clearTimeout(timer2) }
  }, [])

  function formatTime(s: number): string {
    if (s < 60) return `${s}s`
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}m ${sec}s`
  }

  const totalFlags = tasks.reduce((sum, t) => sum + t.verifyFlagCount + t.judgmentFlagCount, 0)
  const firstTaskId = tasks[0]?.taskId

  return (
    <div className="space-y-4">
      {/* Header with celebration */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'linear-gradient(135deg, rgba(196,154,60,0.15), rgba(196,154,60,0.05))' }}>
          <BanjoIcon className="h-5 w-5" mood={celebrating ? "celebration" : "idle"} style={{ color: 'var(--c-gold, #C49A3C)' }} />
        </div>
        {showParticles && <NoteParticles />}
        <div>
          <h3 className="font-semibold">Assignment Complete</h3>
          <span className="text-xs text-muted-foreground">All deliverables ready for review</span>
        </div>
      </div>

      {/* Stat ribbon — animated entrance with count-up numbers */}
      <div
        className="stat-ribbon-enter flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
        style={{
          background: "linear-gradient(135deg, rgba(196,154,60,0.06), rgba(42,143,168,0.04))",
          border: "1px solid rgba(196,154,60,0.15)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <CountUp value={tasks.length} duration={600} delay={300} className="font-semibold" style={{ color: "var(--c-teal)" }} />
          <span className="text-xs text-muted-foreground">deliverable{tasks.length !== 1 ? "s" : ""}</span>
        </div>
        <span className="text-muted-foreground/40">&middot;</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm" style={{ color: "var(--c-teal)" }}>{formatTime(totalTimeSeconds)}</span>
        </div>
        <span className="text-muted-foreground/40">&middot;</span>
        <div className="flex items-center gap-1.5">
          <CountUp value={totalFlags} duration={600} delay={500} className="font-semibold" style={{ color: totalFlags > 0 ? "var(--c-warning)" : "var(--c-success)" }} />
          <span className="text-xs text-muted-foreground">flag{totalFlags !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Deliverables — staggered entrance from right */}
      <div className="space-y-2">
        {tasks.map((t, i) => (
          <div
            key={t.taskId}
            className="deliverable-enter flex items-center gap-3 rounded-[12px] p-4"
            style={{ animationDelay: `${400 + i * 80}ms`, background: 'linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))', border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <span className="check-pop-in text-sm" style={{ animationDelay: `${500 + i * 80}ms` }}>{"\u2705"}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {t.step}. {t.label}
              </p>
              <div className="flex gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">
                  {t.format === "xlsx" ? "\uD83D\uDCCA Excel" : "\uD83D\uDCC4 Word"}
                </Badge>
                {t.verifyFlagCount > 0 && (
                  <Badge variant="outline" className="text-xs text-yellow-600 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t.verifyFlagCount} VERIFY
                  </Badge>
                )}
                {t.judgmentFlagCount > 0 && (
                  <Badge variant="outline" className="text-xs text-c-teal gap-1">
                    <FileText className="h-3 w-3" />
                    {t.judgmentFlagCount} JUDGMENT
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Revision pass result */}
      {revisionStatus === "complete" && revisedCount > 0 && (
        <div className="rounded-[12px] p-4 text-sm" style={{ background: 'rgba(42,143,168,0.04)', border: '1px solid rgba(42,143,168,0.1)' }}>
          <p className="font-medium text-c-teal">
            Banjo made consistency corrections to {revisedCount} deliverable{revisedCount !== 1 ? "s" : ""}
          </p>
          {revisionSummary && <p className="text-c-teal mt-1 text-xs">{revisionSummary}</p>}
        </div>
      )}
      {revisionStatus === "complete" && revisedCount === 0 && (
        <p className="text-xs text-c-success">
          {"\u2705"} Cross-checked all deliverables &mdash; no inconsistencies found
        </p>
      )}
      {revisionStatus === "skipped" && (
        <p className="text-xs text-muted-foreground">
          {"\u26A0\uFE0F"} Quality review was skipped
        </p>
      )}
      {revisionStatus === "failed" && (
        <p className="text-xs text-yellow-700">
          {"\u26A0\uFE0F"} Quality review could not complete &mdash; review deliverables carefully
        </p>
      )}

      {/* Pre-export validation results (C8) */}
      {validationResult && !validationResult.valid && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Export blocked — validation failed
          </p>
          {validationResult.errors?.map((e: any, i: number) => (
            <div key={i} className="text-xs text-red-700">
              <span className="font-medium">{e.stepLabel}:</span>{" "}
              {e.errors.join("; ")}
            </div>
          ))}
        </div>
      )}
      {validationResult?.warnings?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-medium text-amber-800">Warnings:</p>
          {validationResult.warnings.map((w: any, i: number) => (
            <div key={i} className="text-xs text-amber-700">
              <span className="font-medium">{w.stepLabel}:</span>{" "}
              {w.errors.join("; ")}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {firstTaskId && (
          <Link href={`/review/${firstTaskId}`}>
            <Button>Open in Review Queue</Button>
          </Link>
        )}
        {assignmentId && (
          <Button variant="outline" onClick={handleExport} disabled={validating || exporting}>
            {validating ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Validating...</>
            ) : exporting ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Exporting...</>
            ) : (
              <><Download className="mr-1.5 h-4 w-4" /> Export</>
            )}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Total time: {formatTime(totalTimeSeconds)} &middot; Model: Opus 4.6
      </p>
    </div>
  )
}
