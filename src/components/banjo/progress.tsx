"use client"

import { useState, useEffect, useRef } from "react"
import { Progress as ProgressBar } from "@/components/ui/progress"
import { BanjoIcon } from "./banjo-icon"
import { getBanjoMessage, getBanjoPhase } from "@/lib/banjo/loading-messages"

interface DeliverableProgress {
  step: number
  label: string
  status: "waiting" | "generating" | "complete" | "failed" | "skipped"
  percent?: number
  taskId?: string
  verifyFlagCount?: number
  judgmentFlagCount?: number
  error?: string
}

interface BanjoProgressProps {
  deliverables: DeliverableProgress[]
  overallPercent: number
  elapsedSeconds: number
  revisionStatus?: "waiting" | "running" | "complete" | "failed" | "skipped"
  revisionSummary?: string
}

export function BanjoProgress({ deliverables, overallPercent, elapsedSeconds, revisionStatus = "waiting", revisionSummary }: BanjoProgressProps) {
  const [loadingMessage, setLoadingMessage] = useState("")
  const previousMessages = useRef<string[]>([])

  useEffect(() => {
    const phase = revisionStatus === "running" ? "revision" : getBanjoPhase(overallPercent)
    const msg = getBanjoMessage(phase, previousMessages.current)
    setLoadingMessage(msg)
    previousMessages.current.push(msg)

    const interval = setInterval(() => {
      const p = revisionStatus === "running" ? "revision" : getBanjoPhase(overallPercent)
      const m = getBanjoMessage(p, previousMessages.current)
      setLoadingMessage(m)
      previousMessages.current.push(m)
    }, 7000)

    return () => clearInterval(interval)
  }, [overallPercent, revisionStatus])

  const statusIcons: Record<string, string> = {
    waiting: "\u23F3",
    generating: "\uD83C\uDFB5",
    complete: "\u2705",
    failed: "\u274C",
    skipped: "\u23ED\uFE0F",
  }

  const revisionIcons: Record<string, string> = {
    waiting: "\u23F3",
    running: "\uD83C\uDFB5",
    complete: "\u2705",
    failed: "\u26A0\uFE0F",
    skipped: "\u23ED\uFE0F",
  }

  function formatElapsed(s: number): string {
    if (s < 60) return `${s}s`
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}m ${sec}s`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BanjoIcon className="h-5 w-5" animated />
        <span className="text-sm font-medium">Banjo is working on your assignment</span>
      </div>

      {/* Loading message */}
      <div className="rounded-lg border bg-card p-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground italic">{loadingMessage}</p>
        <ProgressBar value={overallPercent} showPercent size="md" />
        <p className="text-xs text-muted-foreground">
          {formatElapsed(elapsedSeconds)} elapsed
        </p>
      </div>

      {/* Per-deliverable status */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Deliverables:</p>
        {deliverables.map((d) => (
          <div key={d.step} className="flex items-center gap-2 text-sm">
            <span>{statusIcons[d.status]}</span>
            <span className="flex-1">
              {d.step}. {d.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {d.status === "generating" && d.percent !== undefined
                ? `generating (${d.percent}%)`
                : d.status === "complete"
                  ? "complete"
                  : d.status === "failed"
                    ? d.error || "failed"
                    : d.status === "skipped"
                      ? "skipped (dependency failed)"
                      : "waiting"}
            </span>
          </div>
        ))}

        {/* Revision pass row */}
        {deliverables.length > 1 && (
          <div className="flex items-center gap-2 text-sm border-t pt-2 mt-2">
            <span>{revisionIcons[revisionStatus]}</span>
            <span className="flex-1">
              Quality Review
            </span>
            <span className="text-xs text-muted-foreground">
              {revisionStatus === "running"
                ? "cross-checking..."
                : revisionStatus === "complete"
                  ? revisionSummary || "done"
                  : revisionStatus === "failed"
                    ? "could not complete"
                    : revisionStatus === "skipped"
                      ? "skipped"
                      : "after all complete"}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: You can navigate away &mdash; Banjo will keep working and notify you when done.
      </p>
    </div>
  )
}
