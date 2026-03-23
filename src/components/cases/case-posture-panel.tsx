"use client"

import { useState } from "react"
import Link from "next/link"

// ═══════════════════════════════════════════════════
// Section header — quiet small caps
// ═══════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  )
}

// ═══════════════════════════════════════════════════
// Next Step Row
// ═══════════════════════════════════════════════════

function NextStepRow({ step, caseId }: { step: any; caseId: string }) {
  const dot =
    step.priority === "critical" ? "bg-red-500" :
    step.priority === "high" ? "bg-amber-400" :
    "bg-gray-300"
  const filled = step.priority === "critical" || step.priority === "high"

  const href =
    step.type === "review" ? "/review" :
    step.type === "banjo" ? `/cases/${caseId}#banjo` :
    step.type === "documents" ? `/cases/${caseId}#documents` :
    undefined

  const content = (
    <div className="flex items-start gap-2 py-1 group">
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${filled ? dot : "border border-gray-400"}`}
        style={filled ? undefined : { backgroundColor: "transparent" }} />
      <div className="min-w-0">
        <p className="text-sm leading-snug text-foreground group-hover:text-foreground/80">{step.action}</p>
        {step.reason && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.reason}</p>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

// ═══════════════════════════════════════════════════
// Main component — prose-first posture panel
// ═══════════════════════════════════════════════════

interface CasePosturePanelProps {
  intelligence: any | null
  caseData: any
  deadlines: any[]
}

export function CasePosturePanel({ intelligence, caseData, deadlines }: CasePosturePanelProps) {
  const [showDetails, setShowDetails] = useState(false)
  const intel = intelligence
  const now = new Date()
  const nextSteps = (intel?.nextSteps as any[]) || []

  // Build "Watch" items — things that need monitoring but aren't actions yet
  const watchItems: string[] = []

  // Expiring documents
  const expiringDocs = (caseData.documents || []).filter(
    (d: any) => d.freshnessStatus === "expiring_soon"
  )
  if (expiringDocs.length > 0) {
    watchItems.push(`${expiringDocs.length} document${expiringDocs.length === 1 ? "" : "s"} expiring soon`)
  }

  // Expired documents
  const expiredDocs = (caseData.documents || []).filter(
    (d: any) => d.freshnessStatus === "expired"
  )
  if (expiredDocs.length > 0) {
    watchItems.push(`${expiredDocs.length} expired document${expiredDocs.length === 1 ? "" : "s"} — request updated copies`)
  }

  // CSED approaching
  if (intel?.csedEarliest) {
    const csed = new Date(intel.csedEarliest)
    const monthsUntil = (csed.getTime() - now.getTime()) / (30 * 86400000)
    if (monthsUntil <= 12 && monthsUntil > 0) {
      watchItems.push(`CSED expiring ${csed.toLocaleDateString()} — verify no tolling events`)
    }
  }

  // Stale intelligence
  if (intel?.daysSinceActivity > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
    watchItems.push(`No activity in ${intel.daysSinceActivity} days`)
  }

  return (
    <div className="space-y-6">
      {/* Posture — prose summary */}
      <section>
        <SectionLabel>Posture</SectionLabel>
        <p className="text-sm leading-relaxed text-foreground">
          {intel?.digest || "Intelligence not yet computed. Upload documents or run an analysis to generate case posture."}
        </p>
      </section>

      {/* What's Next — prioritized action list */}
      {nextSteps.length > 0 && (
        <section>
          <SectionLabel>What&apos;s Next</SectionLabel>
          <div className="space-y-0.5">
            {nextSteps.slice(0, 5).map((step: any, i: number) => (
              <NextStepRow key={i} step={step} caseId={caseData.id} />
            ))}
          </div>
        </section>
      )}

      {/* Watch — monitoring items, only if any exist */}
      {watchItems.length > 0 && (
        <section>
          <SectionLabel>Watch</SectionLabel>
          <div className="space-y-1.5">
            {watchItems.map((item, i) => (
              <p key={i} className="text-sm text-muted-foreground">{item}</p>
            ))}
          </div>
        </section>
      )}

      {/* Expandable raw details */}
      <div className="pt-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? "Hide details" : "Full case details"}
        </button>
        {showDetails && (
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p>Risk score: {intel?.riskScore || 0}/100</p>
            <p>Confidence: {intel?.confidenceScore || 0}/100</p>
            <p>Documents: {intel?.docsReceivedCount || 0}/{intel?.docsRequiredCount || 0} ({intel?.docCompleteness ? Math.round(intel.docCompleteness * 100) : 0}%)</p>
            <p>Phase: {intel?.resolutionPhase || "Gathering Documents"}</p>
            {intel?.irsAssignedUnit && <p>IRS Unit: {intel.irsAssignedUnit}</p>}
            {intel?.irsLastAction && <p>IRS Last Action: {intel.irsLastAction}</p>}
            {intel?.csedEarliest && (
              <p>CSED: {new Date(intel.csedEarliest).toLocaleDateString()} &mdash; {intel.csedLatest ? new Date(intel.csedLatest).toLocaleDateString() : "TBD"}</p>
            )}
            <p>Returns filed: {intel?.allReturnsFiled ? "Yes" : "No"}</p>
            <p>Estimates current: {intel?.currentOnEstimates ? "Yes" : "No"}</p>
            <p>POA on file: {intel?.poaOnFile ? "Yes" : "No"}</p>
            {intel?.levyThreatActive && <p className="text-red-600">Active levy threat</p>}
            {intel?.liensFiledActive && <p className="text-amber-600">Federal tax lien filed</p>}
            {(intel?.confidenceFlags as any[])?.length > 0 && (
              <>
                <p className="font-medium mt-2">Confidence flags:</p>
                {(intel.confidenceFlags as any[]).map((f: any, i: number) => (
                  <p key={i}>{f.issue}</p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
