"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle, Circle, AlertTriangle, Flag } from "lucide-react"
import { redactLeakedPII } from "@/lib/feed/redact-leaked-pii"

const PRIORITY_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  urgent: { text: 'var(--c-danger)', bg: 'var(--c-danger-soft)', border: 'var(--c-danger)' },
  high: { text: 'var(--c-warning)', bg: 'var(--c-warning-soft)', border: 'var(--c-warning)' },
  normal: { text: '', bg: '', border: '' },
  low: { text: 'var(--c-gray-300)', bg: '', border: '' },
}

interface TaskCardProps {
  post: any
  currentUserId: string
  onComplete?: () => void
}

export function TaskCard({ post, currentUserId, onComplete }: TaskCardProps) {
  const [completing, setCompleting] = useState(false)
  const isAssignee = post.taskAssigneeId === currentUserId

  // V2: Use Task record if available, fall back to legacy FeedPost fields.
  // Titles and content are redacted defensively in case an upstream write
  // leaked an encrypted envelope or tokenizer output into the text.
  const task = post.task
  const title = redactLeakedPII(task?.title || post.taskTitle || "")
  const priority = task?.priority || "normal"
  const status = task?.status || (post.taskCompleted ? "completed" : "open")
  const isCompleted = status === "completed" || post.taskCompleted
  const completedAt = task?.completedAt || post.taskCompletedAt
  const dueDate = task?.dueDate ? new Date(task.dueDate) : post.taskDueDate ? new Date(post.taskDueDate) : null
  const isOverdue = dueDate && !isCompleted && dueDate < new Date()

  async function handleComplete() {
    setCompleting(true)
    try {
      // V2: Try Task API first, fall back to legacy
      if (task?.id) {
        const res = await fetch(`/api/tasks/${task.id}/complete`, { method: "POST" })
        if (res.ok) {
          onComplete?.()
          return
        }
      }
      // Legacy fallback
      const res = await fetch(`/api/feed/${post.id}/complete`, { method: "PATCH" })
      if (res.ok) onComplete?.()
    } finally {
      setCompleting(false)
    }
  }

  const pStyle = PRIORITY_STYLES[priority] || PRIORITY_STYLES.normal

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'var(--c-gray-50)',
        border: '1px solid var(--c-gray-100)',
      }}
    >
      <div className="flex items-start gap-2">
        {isCompleted ? (
          <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--c-success)' }} />
        ) : (
          <Circle
            className="h-5 w-5 shrink-0 mt-0.5"
            style={{
              color: priority === "urgent" ? 'var(--c-danger)'
                : priority === "high" ? 'var(--c-warning)'
                : 'var(--c-gray-300)',
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={`font-medium text-sm ${isCompleted ? "line-through" : ""}`}
              style={{ color: isCompleted ? 'var(--c-gray-300)' : 'var(--c-gray-700)' }}
            >
              {title}
            </p>
            {priority !== "normal" && (
              <span
                className="inline-flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  fontSize: '10px',
                  color: pStyle.text,
                  background: pStyle.bg || 'transparent',
                }}
              >
                <Flag className="h-2.5 w-2.5" />
                {priority}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--c-gray-300)' }}>
            {post.taskAssignee && (
              <span>Assigned to: {post.taskAssignee.name}</span>
            )}
            {dueDate && (
              <>
                <span>&middot;</span>
                <span style={{ color: isOverdue ? 'var(--c-danger)' : undefined }}>
                  {isOverdue && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                  Due: {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </>
            )}
          </div>
          {post.case && (
            <Link
              href={`/cases/${post.case.id}`}
              className="font-mono text-xs font-medium hover:underline mt-1 inline-block"
              style={{ color: 'var(--c-teal)' }}
            >
              {/* Prefer tabsNumber for the chip — it's safe-to-display and
                  stable. Fall back to clientName only after redaction, so a
                  leaked encrypted envelope never surfaces here. */}
              #{post.case.tabsNumber || redactLeakedPII(post.case.clientName || "") || "Case"}
            </Link>
          )}
          {post.content && (
            <p className="text-sm mt-2" style={{ color: 'var(--c-gray-300)' }}>
              {redactLeakedPII(post.content)}
            </p>
          )}
          {isCompleted && completedAt && (
            <p className="text-xs mt-1" style={{ color: 'var(--c-success)' }}>
              Completed {new Date(completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      {!isCompleted && isAssignee && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleComplete}
            disabled={completing}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-[var(--c-gray-50)]"
            style={{
              color: 'var(--c-gray-300)',
            }}
          >
            <CheckCircle className="h-3 w-3" />
            {completing ? "Completing..." : "Mark Complete"}
          </button>
        </div>
      )}
    </div>
  )
}
