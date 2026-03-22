"use client"

import { RESOLUTION_PHASES, RESOLUTION_PHASE_LABELS } from "@/lib/case-intelligence/phases"
import { formatDate, formatRelative } from "@/lib/date-utils"
import { AlertTriangle, CheckCircle, XCircle, Shield, FileText } from "lucide-react"

interface SmartStatusCardProps {
  caseData: any
  intelligence: any | null
}

export function SmartStatusCard({ caseData, intelligence }: SmartStatusCardProps) {
  const intel = intelligence

  const currentPhase = intel?.resolutionPhase || "GATHERING_DOCUMENTS"
  const phaseInfo = RESOLUTION_PHASES[currentPhase]
  const phaseOrder = phaseInfo?.order || 1

  // Build phase rail — show key phases
  const railPhases = [
    "GATHERING_DOCUMENTS",
    "ANALYZING",
    "PREPARING_FORMS",
    "PRACTITIONER_REVIEW",
    "FILED_WITH_IRS",
    "IRS_PROCESSING",
    "ACCEPTED",
  ]

  const docCompleteness = intel?.docCompleteness || 0
  const docPercent = Math.round(docCompleteness * 100)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            {caseData.caseNumber} · {caseData.caseType}
            {intel?.resolutionType && <span className="text-muted-foreground"> ({intel.resolutionType})</span>}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {intel?.levyThreatActive && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              <AlertTriangle className="h-3 w-3" />
              Levy threat
            </span>
          )}
          {intel?.liensFiledActive && (
            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
              Lien filed
            </span>
          )}
        </div>
      </div>

      {/* Phase rail */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          {railPhases.map((phase, i) => {
            const pInfo = RESOLUTION_PHASES[phase]
            const isCurrent = phase === currentPhase
            const isCompleted = pInfo && phaseInfo && pInfo.order < phaseOrder
            return (
              <div key={phase} className="flex items-center gap-1">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    isCurrent ? "bg-primary ring-2 ring-primary/30" :
                    isCompleted ? "bg-primary" :
                    "bg-muted"
                  }`}
                  title={RESOLUTION_PHASE_LABELS[phase]}
                />
                {i < railPhases.length - 1 && (
                  <div className={`h-0.5 w-4 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs font-medium">
          {RESOLUTION_PHASE_LABELS[currentPhase] || currentPhase}
        </p>
      </div>

      {/* Document completeness */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Documents
          </span>
          <span className="font-medium">{docPercent}% received</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${
              docPercent >= 80 ? "bg-green-500" : docPercent >= 50 ? "bg-amber-500" : "bg-red-400"
            }`}
            style={{ width: `${docPercent}%` }}
          />
        </div>
      </div>

      {/* IRS Position */}
      {intel?.irsLastAction && (
        <div className="text-xs space-y-0.5">
          <p className="text-muted-foreground">IRS Position</p>
          <p className="font-medium">
            {intel.irsLastAction}
            {intel.irsLastActionDate && (
              <span className="text-muted-foreground"> ({formatDate(intel.irsLastActionDate)})</span>
            )}
          </p>
          {intel.irsAssignedUnit && (
            <p className="text-muted-foreground">Unit: {intel.irsAssignedUnit}</p>
          )}
        </div>
      )}

      {/* Compliance */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          {intel?.allReturnsFiled ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500" />
          )}
          Returns filed
        </span>
        <span className="flex items-center gap-1">
          {intel?.currentOnEstimates ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500" />
          )}
          Estimates current
        </span>
        <span className="flex items-center gap-1">
          {intel?.poaOnFile ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500" />
          )}
          POA on file
        </span>
      </div>

      {/* CSED Range */}
      {(intel?.csedEarliest || intel?.csedLatest) && (
        <p className="text-xs text-muted-foreground">
          CSED Range: {intel.csedEarliest ? formatDate(intel.csedEarliest, { month: "short", year: "numeric" }) : "?"} — {intel.csedLatest ? formatDate(intel.csedLatest, { month: "short", year: "numeric" }) : "?"}
        </p>
      )}

      {/* Last activity */}
      {intel?.lastActivityAction && (
        <p className="text-xs text-muted-foreground border-t pt-2">
          Last: {intel.lastActivityAction}
          {intel.lastActivityBy && <> · {intel.lastActivityBy}</>}
          {intel.lastActivityDate && <> · {formatRelative(intel.lastActivityDate)}</>}
        </p>
      )}
    </div>
  )
}
