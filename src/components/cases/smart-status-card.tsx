"use client"

import { useState } from "react"
import { RESOLUTION_PHASES, RESOLUTION_PHASE_LABELS } from "@/lib/case-intelligence/phases"
import { formatDate, formatRelative } from "@/lib/date-utils"
import { AlertTriangle, CheckCircle, XCircle, Shield, FileText, ChevronDown, ChevronRight, AlertCircle, Check, X } from "lucide-react"

interface SmartStatusCardProps {
  caseData: any
  intelligence: any | null
  documents?: any[]
}

export function SmartStatusCard({ caseData, intelligence, documents = [] }: SmartStatusCardProps) {
  const [docsExpanded, setDocsExpanded] = useState(false)
  const intel = intelligence

  // Compute freshness counts from documents
  const expiredCount = documents.filter(d => d.freshnessStatus === "expired").length
  const expiringCount = documents.filter(d => d.freshnessStatus === "expiring_soon").length

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
          <h3 className="font-medium text-sm">
            {caseData.tabsNumber || "No TABS #"}
            {" · "}{caseData.caseType}
            {intel?.resolutionType && <span className="text-muted-foreground"> ({intel.resolutionType})</span>}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {intel?.levyThreatActive && (
            <span className="flex items-center gap-1 rounded-full bg-c-danger-soft px-2 py-0.5 text-xs font-medium text-c-danger">
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
              docPercent >= 80 ? "bg-c-success" : docPercent >= 50 ? "bg-c-warning-soft" : "bg-c-danger"
            }`}
            style={{ width: `${docPercent}%` }}
          />
        </div>
      </div>

      {/* Document checklist (expandable) */}
      {intel?.docsRequired && (intel.docsRequired as any[]).length > 0 && (
        <div>
          <button
            onClick={() => setDocsExpanded(!docsExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {docsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {intel?.docsReceivedCount || 0} of {intel?.docsRequiredCount || 0} required documents
          </button>
          {docsExpanded && (
            <div className="mt-2 space-y-1 pl-1">
              {(intel.docsRequired as any[]).map((doc: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {doc.received ? (
                    <Check className="h-3 w-3 text-c-success flex-shrink-0" />
                  ) : doc.critical ? (
                    <AlertCircle className="h-3 w-3 text-c-danger flex-shrink-0" />
                  ) : (
                    <X className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                  )}
                  <span className={doc.received
                    ? "text-muted-foreground line-through"
                    : doc.critical
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }>
                    {doc.label}
                    {doc.critical && !doc.received && (
                      <span className="text-c-danger ml-1">(required)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document freshness warnings */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div className="space-y-1 rounded-md border border-c-warning/20 bg-c-warning-soft p-2">
          {expiredCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-c-danger">
              <AlertTriangle className="h-3 w-3" />
              {expiredCount} expired document{expiredCount !== 1 ? "s" : ""} need{expiredCount === 1 ? "s" : ""} replacement
            </p>
          )}
          {expiringCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-c-warning">
              <AlertTriangle className="h-3 w-3" />
              {expiringCount} document{expiringCount !== 1 ? "s" : ""} expiring within 30 days
            </p>
          )}
        </div>
      )}

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
            <CheckCircle className="h-3 w-3 text-c-success" />
          ) : (
            <XCircle className="h-3 w-3 text-c-danger" />
          )}
          Returns filed
        </span>
        <span className="flex items-center gap-1">
          {intel?.currentOnEstimates ? (
            <CheckCircle className="h-3 w-3 text-c-success" />
          ) : (
            <XCircle className="h-3 w-3 text-c-danger" />
          )}
          Estimates current
        </span>
        <span className="flex items-center gap-1">
          {intel?.poaOnFile ? (
            <CheckCircle className="h-3 w-3 text-c-success" />
          ) : (
            <XCircle className="h-3 w-3 text-c-danger" />
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
