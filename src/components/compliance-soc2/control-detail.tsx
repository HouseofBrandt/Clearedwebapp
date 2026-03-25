"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileCheck,
  Activity,
  AlertOctagon,
} from "lucide-react"

interface ControlDetailProps {
  control: {
    id: string
    controlId: string
    tsc: string
    controlFamily: string
    description: string
    monitoringMethod: string
    status: string
    whatSoc2Requires: string
    howClearedMeetsIt: string
    whyItMatters: string
    lastEvidenceCollected: string | null
    nextReviewDate: string | null
    openIssueCount: number
    latestHealthResult: { status: string; details: any } | null
    evidenceCount: number
    evidence: any[]
  }
  expanded: boolean
  onToggle: () => void
  onStatusChange: (status: string) => void
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: any; badgeClass: string }
> = {
  COMPLIANT: {
    label: "Compliant",
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  PARTIALLY_COMPLIANT: {
    label: "Partial",
    icon: AlertTriangle,
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  NON_COMPLIANT: {
    label: "Non-Compliant",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  NOT_ASSESSED: {
    label: "Not Assessed",
    icon: HelpCircle,
    badgeClass: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  },
}

const MONITORING_LABELS: Record<string, string> = {
  AUTOMATED: "Automated",
  MANUAL: "Manual",
  HYBRID: "Hybrid",
}

const HEALTH_ICONS: Record<string, { icon: any; color: string }> = {
  pass: { icon: CheckCircle2, color: "text-green-600" },
  fail: { icon: XCircle, color: "text-red-600" },
  warning: { icon: AlertTriangle, color: "text-yellow-600" },
}

export function ControlDetail({
  control,
  expanded,
  onToggle,
  onStatusChange,
}: ControlDetailProps) {
  const statusConfig = STATUS_CONFIG[control.status] || STATUS_CONFIG.NOT_ASSESSED
  const StatusIcon = statusConfig.icon
  const healthInfo = control.latestHealthResult
    ? HEALTH_ICONS[control.latestHealthResult.status]
    : null
  const HealthIcon = healthInfo?.icon

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="font-mono text-sm font-medium w-16 shrink-0">
          {control.controlId}
        </span>

        <span className="text-sm flex-1 truncate">{control.description}</span>

        <div className="flex items-center gap-2 shrink-0">
          {control.openIssueCount > 0 && (
            <Badge variant="outline" className="text-xs bg-red-50 text-red-700">
              <AlertOctagon className="h-3 w-3 mr-1" />
              {control.openIssueCount}
            </Badge>
          )}

          {HealthIcon && (
            <HealthIcon className={`h-4 w-4 ${healthInfo?.color}`} />
          )}

          <Badge variant="outline" className="text-xs">
            {MONITORING_LABELS[control.monitoringMethod] || control.monitoringMethod}
          </Badge>

          <Badge className={`text-xs ${statusConfig.badgeClass}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
          {/* Three Explanation Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What SOC 2 Requires
              </h4>
              <p className="text-sm">{control.whatSoc2Requires}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-blue-600">
                How Cleared Meets It
              </h4>
              <p className="text-sm">{control.howClearedMeetsIt}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-amber-600">
                Why It Matters
              </h4>
              <p className="text-sm">{control.whyItMatters}</p>
            </div>
          </div>

          {/* Evidence & Health Check Row */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              <span>
                {control.evidenceCount} evidence item
                {control.evidenceCount !== 1 ? "s" : ""}
              </span>
              {control.lastEvidenceCollected && (
                <span className="text-muted-foreground">
                  (last:{" "}
                  {new Date(control.lastEvidenceCollected).toLocaleDateString()})
                </span>
              )}
            </div>

            {control.latestHealthResult && (
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span>
                  Health:{" "}
                  <span
                    className={
                      control.latestHealthResult.status === "pass"
                        ? "text-green-600"
                        : control.latestHealthResult.status === "fail"
                          ? "text-red-600"
                          : "text-yellow-600"
                    }
                  >
                    {control.latestHealthResult.status.toUpperCase()}
                  </span>
                </span>
              </div>
            )}

            {control.nextReviewDate && (
              <div className="text-muted-foreground">
                Next review: {new Date(control.nextReviewDate).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Gap Analysis */}
          {(control.status === "NON_COMPLIANT" ||
            control.status === "NOT_ASSESSED") && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <h4 className="text-xs font-medium uppercase tracking-wide text-red-600 mb-1">
                Gap Analysis
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                {control.status === "NOT_ASSESSED"
                  ? "This control has not been assessed. Evidence collection and testing are needed to determine compliance status."
                  : `This control is non-compliant. ${control.openIssueCount} open issue${control.openIssueCount !== 1 ? "s" : ""} must be resolved. Review the remediation plan and collect evidence to demonstrate compliance.`}
              </p>
            </div>
          )}

          {/* Status Change Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground mr-2">
              Set status:
            </span>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <Button
                key={status}
                variant={control.status === status ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onStatusChange(status)
                }}
                disabled={control.status === status}
              >
                {config.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
