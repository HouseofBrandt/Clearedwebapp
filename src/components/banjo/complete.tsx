"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
}

export function BanjoComplete({ tasks, totalTimeSeconds, model }: BanjoCompleteProps) {
  function formatTime(s: number): string {
    if (s < 60) return `${s}s`
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}m ${sec}s`
  }

  const firstTaskId = tasks[0]?.taskId

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BanjoIcon className="h-5 w-5" />
        <h3 className="font-medium">Assignment Complete</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        {tasks.length} deliverable{tasks.length !== 1 ? "s" : ""} ready for review:
      </p>

      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.taskId} className="flex items-center gap-2 rounded-lg border p-3">
            <span className="text-sm">\u2705</span>
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
                  <Badge variant="outline" className="text-xs text-blue-600 gap-1">
                    <FileText className="h-3 w-3" />
                    {t.judgmentFlagCount} JUDGMENT
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {firstTaskId && (
          <Link href={`/review/${firstTaskId}`}>
            <Button>Open in Review Queue</Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Total time: {formatTime(totalTimeSeconds)} &middot; Model: {model === "claude-opus-4-6" ? "Opus 4.6" : "Sonnet 4.6"}
      </p>
    </div>
  )
}
