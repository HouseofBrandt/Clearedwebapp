"use client"

import { formatDateTime, formatRelative } from "@/lib/date-utils"

interface Activity {
  id: string
  action: string
  description: string
  metadata?: any
  userId?: string | null
  user?: { name: string } | null
  createdAt: string
}

interface ActivityFeedProps {
  activities: Activity[]
}

const ACTION_COLORS: Record<string, string> = {
  DOCUMENT_UPLOADED: "bg-c-teal",
  ANALYSIS_RUN: "bg-c-teal",
  REVIEW_COMPLETED: "bg-c-teal",
  DELIVERABLE_EXPORTED: "bg-c-teal",
  IRS_LETTER_DETECTED: "bg-c-warning-soft",
  DEADLINE_CREATED: "bg-c-warning-soft",
  DOCUMENT_REQUESTED: "bg-c-success",
  CHAT_ACTION: "bg-c-success",
  STATUS_CHANGED: "bg-purple-500",
  NOTE_ADDED: "bg-c-gray-300",
  FORM_GENERATED: "bg-c-success",
}

const ACTION_LABELS: Record<string, string> = {
  DOCUMENT_UPLOADED: "Upload",
  ANALYSIS_RUN: "Analysis",
  REVIEW_COMPLETED: "Review",
  DELIVERABLE_EXPORTED: "Export",
  IRS_LETTER_DETECTED: "IRS Notice",
  DEADLINE_CREATED: "Deadline",
  DOCUMENT_REQUESTED: "Doc Request",
  CHAT_ACTION: "Chat Action",
  STATUS_CHANGED: "Status",
  NOTE_ADDED: "Note",
  FORM_GENERATED: "Form",
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload documents or run an analysis to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, i) => {
        const color = ACTION_COLORS[activity.action] || "bg-c-gray-300"
        const label = ACTION_LABELS[activity.action] || activity.action
        const userName = activity.user?.name || "System"
        const isSystem = !activity.userId || activity.action === "IRS_LETTER_DETECTED"

        return (
          <div key={activity.id} className="flex gap-3 py-2.5">
            {/* Timeline dot and line */}
            <div className="flex flex-col items-center">
              <div className={`h-2.5 w-2.5 rounded-full ${color} shrink-0 mt-1.5`} />
              {i < activities.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">
                  {isSystem ? "System" : userName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatRelative(activity.createdAt)}
                </span>
              </div>
              <p className="text-sm text-foreground mt-0.5">
                {activity.description}
              </p>
              {/* Key findings from document triage */}
              {activity.metadata?.keyFindings && (
                <div className="mt-1 space-y-0.5">
                  {(activity.metadata.keyFindings as string[]).map((finding: string, j: number) => (
                    <p key={j} className="text-xs text-muted-foreground">
                      → {finding}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Badge */}
            <span className="shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-1.5">
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
