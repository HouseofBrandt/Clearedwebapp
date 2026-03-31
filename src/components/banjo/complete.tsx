"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

export function BanjoComplete({ tasks, totalTimeSeconds, model, failedSteps = [], skippedSteps = [], revisionStatus = "not_run", revisionSummary, revisedCount = 0, assignmentId }: BanjoCompleteProps) {
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
        {tasks.length} deliverable{tasks.length !== 1 ? "s" : ""} ready for review
        {failedSteps.length > 0 && ` (${failedSteps.length} failed)`}
        {skippedSteps.length > 0 && ` (${skippedSteps.length} skipped)`}:
      </p>

      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.taskId} className="flex items-center gap-2 rounded-lg border p-3">
            <span className="text-sm">{"\u2705"}</span>
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

      {/* Revision pass result */}
      {revisionStatus === "complete" && revisedCount > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-medium text-blue-800">
            Banjo made consistency corrections to {revisedCount} deliverable{revisedCount !== 1 ? "s" : ""}
          </p>
          {revisionSummary && <p className="text-blue-700 mt-1 text-xs">{revisionSummary}</p>}
        </div>
      )}
      {revisionStatus === "complete" && revisedCount === 0 && (
        <p className="text-xs text-green-700">
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
