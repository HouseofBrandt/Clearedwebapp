"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileSpreadsheet, FileText } from "lucide-react"
import { BanjoIcon } from "./banjo-icon"

interface Deliverable {
  stepNumber: number
  label: string
  description: string
  format: "xlsx" | "docx" | "txt"
  taskType: string
  dependsOn: number[]
  dataSources: string[]
}

interface Assumption {
  text: string
  severity: "info" | "warning"
}

interface BanjoPlan {
  deliverables: Deliverable[]
  assumptions: Assumption[]
  estimatedTimeSeconds: number
}

interface BanjoPlanReviewProps {
  plan: BanjoPlan
  model: string
  onApprove: () => void
  onCancel: () => void
  disabled?: boolean
}

const FORMAT_ICONS: Record<string, { icon: typeof FileText; label: string; emoji: string }> = {
  xlsx: { icon: FileSpreadsheet, label: "Excel", emoji: "\uD83D\uDCCA" },
  docx: { icon: FileText, label: "Word", emoji: "\uD83D\uDCC4" },
  txt: { icon: FileText, label: "Text", emoji: "\uD83D\uDCC4" },
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export function BanjoPlanReview({ plan, model, onApprove, onCancel, disabled }: BanjoPlanReviewProps) {
  const dataSources = new Set<string>()
  plan.deliverables.forEach((d) => d.dataSources?.forEach((s) => dataSources.add(s)))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BanjoIcon className="h-5 w-5" />
        <h3 className="font-medium">Assignment Plan</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        I&apos;ll produce {plan.deliverables.length} deliverable{plan.deliverables.length !== 1 ? "s" : ""} for this assignment:
      </p>

      {/* Deliverable cards */}
      <div className="rounded-lg border divide-y">
        {plan.deliverables.map((d) => {
          const fmt = FORMAT_ICONS[d.format] || FORMAT_ICONS.docx
          return (
            <div key={d.stepNumber} className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {d.stepNumber}. {d.label}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  {fmt.emoji} {fmt.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{d.description}</p>
              {d.dependsOn?.length > 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Depends on: Step {d.dependsOn.join(", ")}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Assumptions */}
      {plan.assumptions?.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
            <span className="font-medium text-sm">Assumptions:</span>
          </div>
          <ul className="space-y-1 pl-5">
            {plan.assumptions.map((a, i) => (
              <li key={i} className="text-xs text-muted-foreground list-disc">
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {dataSources.size > 0 && (
          <span>Data sources: {Array.from(dataSources).join(", ")}</span>
        )}
        <span>Model: {model === "claude-opus-4-6" ? "Opus 4.6" : "Sonnet 4.6"}</span>
        <span>Est. time: {formatTime(plan.estimatedTimeSeconds)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={onApprove} disabled={disabled}>
          <BanjoIcon className="mr-2 h-4 w-4" />
          Run It
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
