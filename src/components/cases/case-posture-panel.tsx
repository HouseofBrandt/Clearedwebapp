"use client"

import { Badge } from "@/components/ui/badge"
import { CASE_TYPE_LABELS } from "@/types"
import Link from "next/link"
import { ArrowRight, AlertTriangle, Shield, FileCheck } from "lucide-react"

// ═══════════════════════════════════════════════════
// Risk heat indicator
// ═══════════════════════════════════════════════════

function RiskIndicator({ score }: { score: number }) {
  const color =
    score >= 76 ? "text-red-600 bg-red-50 border-red-200" :
    score >= 51 ? "text-orange-600 bg-orange-50 border-orange-200" :
    score >= 26 ? "text-amber-600 bg-amber-50 border-amber-200" :
    "text-emerald-600 bg-emerald-50 border-emerald-200"
  const dot =
    score >= 76 ? "bg-red-500" :
    score >= 51 ? "bg-orange-500" :
    score >= 26 ? "bg-amber-400" :
    "bg-emerald-500"

  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${color}`}>
      <div className={`h-3 w-3 rounded-full ${dot}`} />
      <div>
        <span className="text-xl font-bold">{score}</span>
        <span className="text-xs font-medium ml-1">/100</span>
      </div>
      <span className="text-xs ml-auto">Risk</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Section header
// ═══════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}
    </p>
  )
}

// ═══════════════════════════════════════════════════
// Bundle readiness badge
// ═══════════════════════════════════════════════════

function BundleBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    ready: "bg-emerald-100 text-emerald-800",
    partial: "bg-amber-100 text-amber-800",
    blocked: "bg-red-100 text-red-700",
  }
  const icons: Record<string, string> = {
    ready: "\u2705",
    partial: "\u26A0\uFE0F",
    blocked: "\u274C",
  }
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span>{label}</span>
      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${styles[status] || ""}`}>
        {icons[status] || ""} {status}
      </Badge>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Phase label
// ═══════════════════════════════════════════════════

const PHASE_LABELS: Record<string, string> = {
  GATHERING_DOCUMENTS: "Gathering Documents",
  ANALYZING: "Analysis",
  PREPARING_FORMS: "Preparing Forms",
  PRACTITIONER_REVIEW: "Practitioner Review",
  FILED_WITH_IRS: "Filed with IRS",
  IRS_PROCESSING: "IRS Processing",
  IRS_RESPONSE_RECEIVED: "IRS Response Received",
  APPEALS: "Appeals",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  CLOSED: "Closed",
}

// ═══════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════

interface CasePosturePanelProps {
  intelligence: any | null
  caseData: any
  deadlines: any[]
}

export function CasePosturePanel({ intelligence, caseData, deadlines }: CasePosturePanelProps) {
  const intel = intelligence
  const now = new Date()

  const riskScore = intel?.riskScore || 0
  const confidenceScore = intel?.confidenceScore || 0
  const nextSteps = (intel?.nextSteps as any[]) || []
  const bundleReadiness = (intel?.bundleReadiness as Record<string, string>) || {}
  const riskFactors = (intel?.riskFactors as any[]) || []

  // Doc completeness
  const docPct = intel?.docCompleteness ? Math.round(intel.docCompleteness * 100) : 0
  const docColor = docPct >= 80 ? "bg-emerald-500" : docPct >= 50 ? "bg-amber-400" : "bg-red-500"

  // Confidence
  const confColor = confidenceScore >= 70 ? "text-emerald-600" : confidenceScore >= 40 ? "text-amber-600" : "text-red-600"

  // Approaching deadlines
  const urgentDeadlines = deadlines.filter((d: any) => {
    const due = new Date(d.dueDate)
    const days = Math.ceil((due.getTime() - now.getTime()) / 86400000)
    return days <= 7 && d.status !== "COMPLETED" && d.status !== "WAIVED"
  })

  // Document freshness warnings
  const docsWithFreshness = (caseData.documents || []).filter(
    (d: any) => d.freshnessStatus === "expired" || d.freshnessStatus === "expiring_soon"
  )

  // Bundle readiness labels
  const bundleLabels: Record<string, string> = {
    oicPacket: "OIC Packet",
    iaPacket: "IA Packet",
    penaltyPacket: "Penalty Analysis",
    appealsPacket: "Appeals",
    tfrpPacket: "TFRP Analysis",
    innocentSpousePacket: "Innocent Spouse",
  }

  return (
    <div className="space-y-5">
      {/* Risk Score */}
      <RiskIndicator score={riskScore} />

      {/* Resolution Phase */}
      <div>
        <SectionLabel>Resolution Phase</SectionLabel>
        <Badge variant="secondary" className="text-xs">
          {PHASE_LABELS[intel?.resolutionPhase] || intel?.resolutionPhase || "Gathering Documents"}
        </Badge>
      </div>

      {/* Doc Completeness */}
      <div>
        <SectionLabel>Document Completeness</SectionLabel>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full rounded-full ${docColor} transition-all`} style={{ width: `${docPct}%` }} />
          </div>
          <span className="text-xs font-semibold">{docPct}%</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {intel?.docsReceivedCount || 0} of {intel?.docsRequiredCount || 0} required docs
        </p>
      </div>

      {/* IRS Position */}
      {(intel?.irsLastAction || intel?.irsAssignedUnit) && (
        <div>
          <SectionLabel>IRS Position</SectionLabel>
          <div className="text-xs space-y-0.5">
            {intel.irsLastAction && <p>{intel.irsLastAction}</p>}
            {intel.irsAssignedUnit && <p className="text-muted-foreground">Unit: {intel.irsAssignedUnit}</p>}
          </div>
        </div>
      )}

      {/* Risk Indicators */}
      {(intel?.levyThreatActive || intel?.liensFiledActive) && (
        <div>
          <SectionLabel>Risk Indicators</SectionLabel>
          <div className="space-y-1">
            {intel.levyThreatActive && (
              <div className="flex items-center gap-1.5 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Active levy threat
              </div>
            )}
            {intel.liensFiledActive && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Federal tax lien filed
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSED */}
      {intel?.csedEarliest && (
        <div>
          <SectionLabel>CSED Range</SectionLabel>
          <p className="text-xs">
            {new Date(intel.csedEarliest).toLocaleDateString()} &mdash;{" "}
            {intel.csedLatest ? new Date(intel.csedLatest).toLocaleDateString() : "TBD"}
          </p>
        </div>
      )}

      {/* Compliance */}
      <div>
        <SectionLabel>Compliance</SectionLabel>
        <div className="grid grid-cols-3 gap-1 text-[11px]">
          <div className="flex items-center gap-1">
            {intel?.allReturnsFiled
              ? <FileCheck className="h-3 w-3 text-emerald-500" />
              : <Shield className="h-3 w-3 text-muted-foreground" />}
            <span>Returns</span>
          </div>
          <div className="flex items-center gap-1">
            {intel?.currentOnEstimates
              ? <FileCheck className="h-3 w-3 text-emerald-500" />
              : <Shield className="h-3 w-3 text-muted-foreground" />}
            <span>Estimates</span>
          </div>
          <div className="flex items-center gap-1">
            {intel?.poaOnFile
              ? <FileCheck className="h-3 w-3 text-emerald-500" />
              : <Shield className="h-3 w-3 text-muted-foreground" />}
            <span>POA</span>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <SectionLabel>Intelligence Confidence</SectionLabel>
        <p className={`text-sm font-semibold ${confColor}`}>{confidenceScore}%</p>
        {(intel?.confidenceFlags as any[])?.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {(intel.confidenceFlags as any[]).slice(0, 3).map((f: any, i: number) => (
              <p key={i} className="text-[10px] text-muted-foreground">{f.issue}</p>
            ))}
          </div>
        )}
      </div>

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <div>
          <SectionLabel>Next Steps</SectionLabel>
          <div className="space-y-1.5">
            {nextSteps.slice(0, 5).map((step: any, i: number) => {
              const dot =
                step.priority === "critical" ? "bg-red-500" :
                step.priority === "high" ? "bg-amber-400" :
                "bg-gray-300"
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <div className={`h-2 w-2 rounded-full shrink-0 mt-1 ${dot}`} />
                  <span className="line-clamp-2">{step.action}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bundle Readiness */}
      {Object.keys(bundleReadiness).length > 0 && (
        <div>
          <SectionLabel>Bundle Readiness</SectionLabel>
          <div className="space-y-0.5">
            {Object.entries(bundleReadiness).map(([key, status]) => (
              <BundleBadge key={key} label={bundleLabels[key] || key} status={status} />
            ))}
          </div>
        </div>
      )}

      {/* Document Freshness Warnings */}
      {docsWithFreshness.length > 0 && (
        <div>
          <SectionLabel>Documents at Risk</SectionLabel>
          <div className="space-y-1">
            {docsWithFreshness.slice(0, 3).map((d: any) => (
              <div key={d.id} className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{d.fileName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
