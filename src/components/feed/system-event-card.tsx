"use client"

import Link from "next/link"

const EVENT_ICONS: Record<string, string> = {
  banjo_complete: "\uD83E\uDE95",
  document_upload: "\uD83D\uDCC4",
  deadline_warning: "\u26A0\uFE0F",
  review_approved: "\u2705",
  review_rejected: "\u274C",
  case_status_change: "\uD83D\uDD04",
  task_created: "\uD83D\uDCCB",
  task_completed: "\u2705",
}

interface SystemEventCardProps {
  post: any
}

export function SystemEventCard({ post }: SystemEventCardProps) {
  const icon = EVENT_ICONS[post.eventType] || "\uD83D\uDD14"
  const eventData = post.eventData as Record<string, any> | null

  return (
    <div className="py-2 mb-1">
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0">{icon}</span>
        <div className="flex-1 min-w-0 text-xs" style={{ color: 'var(--c-gray-300)' }}>
          <span>{post.content}</span>
          {post.case && (
            <>
              {" for "}
              <Link
                href={`/cases/${post.case.id}`}
                className="font-mono text-xs font-medium hover:underline"
                style={{ color: 'var(--c-teal)' }}
              >
                #{post.case.clientName || post.case.tabsNumber}
              </Link>
            </>
          )}
          <span className="ml-2" style={{ color: 'var(--c-gray-200)' }}>
            {timeAgo(post.createdAt)}
          </span>

          {/* Banjo deliverables list */}
          {post.eventType === "banjo_complete" && eventData?.deliverables && (
            <div className="mt-1" style={{ color: 'var(--c-gray-300)' }}>
              {(eventData.deliverables as string[]).join(", ")}
              <Link href="/review" className="ml-2 hover:underline" style={{ color: 'var(--c-teal)' }}>
                Open in Review Queue
              </Link>
            </div>
          )}

          {/* Document list */}
          {post.eventType === "document_upload" && eventData?.documents && (
            <div className="mt-1" style={{ color: 'var(--c-gray-300)' }}>
              {(eventData.documents as { name: string }[]).map((d) => d.name).join(", ")}
            </div>
          )}

          {/* Deadline warning */}
          {post.eventType === "deadline_warning" && eventData?.deadline && (
            <div className="mt-1" style={{ color: 'var(--c-gray-300)' }}>
              {(eventData.deadline as any).title}
            </div>
          )}

          {/* Task events */}
          {(post.eventType === "task_created" || post.eventType === "task_completed") && eventData?.taskTitle && (
            <div className="mt-1" style={{ color: 'var(--c-gray-300)' }}>
              {eventData.taskTitle}
              {eventData.completedByName && (
                <span className="ml-1">by {eventData.completedByName}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
