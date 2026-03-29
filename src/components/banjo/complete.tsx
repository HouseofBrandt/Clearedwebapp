"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CountUp } from "@/components/ui/count-up"
import { BanjoIcon } from "./banjo-icon"
import Link from "next/link"
import { AlertTriangle, FileText } from "lucide-react"

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
            color: "var(--c-teal)",
            opacity: 0.7,
          } as React.CSSProperties}
        >
          {note}
        </span>
      ))}
    </div>
  )
}

export function BanjoComplete({ tasks, totalTimeSeconds, model, failedSteps = [], skippedSteps = [], revisionStatus = "not_run", revisionSummary, revisedCount = 0 }: BanjoCompleteProps) {
  const [showParticles, setShowParticles] = useState(true)
  const [celebrating, setCelebrating] = useState(true)

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
      <div className="relative flex items-center gap-2">
        <BanjoIcon className="h-5 w-5" mood={celebrating ? "celebration" : "idle"} />
        {showParticles && <NoteParticles />}
        <h3 className="font-medium">Assignment Complete</h3>
      </div>

      {/* Stat ribbon — animated entrance with count-up numbers */}
      <div
        className="stat-ribbon-enter flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
        style={{
          background: "rgba(46,134,171,0.06)",
          border: "1px solid rgba(46,134,171,0.15)",
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
            className="deliverable-enter flex items-center gap-2 rounded-lg border p-3"
            style={{ animationDelay: `${400 + i * 80}ms` }}
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
        <div className="rounded-lg border border-c-teal/20 bg-c-info-soft p-3 text-sm">
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

      <div className="flex gap-2">
        {firstTaskId && (
          <Link href={`/review/${firstTaskId}`}>
            <Button>Open in Review Queue</Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Total time: {formatTime(totalTimeSeconds)} &middot; Model: Opus 4.6
      </p>
    </div>
  )
}
