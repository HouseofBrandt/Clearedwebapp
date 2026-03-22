"use client"

import { useState, useEffect, useRef } from "react"
import { Progress as ProgressBar } from "@/components/ui/progress"
import { BanjoIcon } from "./banjo-icon"
import { getBanjoMessage, getBanjoPhase } from "@/lib/banjo/loading-messages"

interface DeliverableProgress {
  step: number
  label: string
  status: "waiting" | "generating" | "complete" | "failed"
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
}

export function BanjoProgress({ deliverables, overallPercent, elapsedSeconds }: BanjoProgressProps) {
  const [loadingMessage, setLoadingMessage] = useState("")
  const previousMessages = useRef<string[]>([])

  useEffect(() => {
    const phase = getBanjoPhase(overallPercent)
    const msg = getBanjoMessage(phase, previousMessages.current)
    setLoadingMessage(msg)
    previousMessages.current.push(msg)

    const interval = setInterval(() => {
      const p = getBanjoPhase(overallPercent)
      const m = getBanjoMessage(p, previousMessages.current)
      setLoadingMessage(m)
      previousMessages.current.push(m)
    }, 7000)

    return () => clearInterval(interval)
  }, [overallPercent])

  const statusIcons: Record<string, string> = {
    waiting: "\u23F3",
    generating: "\uD83C\uDFB5",
    complete: "\u2705",
    failed: "\u274C",
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
                    : "waiting"}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: You can navigate away \u2014 Banjo will keep working and notify you when done.
      </p>
    </div>
  )
}
