"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle, Circle, AlertTriangle, Flag } from "lucide-react"

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  normal: "",
  low: "text-muted-foreground",
}

interface TaskCardProps {
  post: any
  currentUserId: string
  onComplete?: () => void
}

export function TaskCard({ post, currentUserId, onComplete }: TaskCardProps) {
  const [completing, setCompleting] = useState(false)
  const isAssignee = post.taskAssigneeId === currentUserId

  // V2: Use Task record if available, fall back to legacy FeedPost fields
  const task = post.task
  const title = task?.title || post.taskTitle
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

  const priorityClass = PRIORITY_COLORS[priority] || ""

  return (
    <div className={`border rounded-lg p-3 bg-card ${priority === "urgent" ? "border-red-200" : priority === "high" ? "border-orange-200" : ""}`}>
      <div className="flex items-start gap-2">
        {isCompleted ? (
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <Circle className={`h-5 w-5 shrink-0 mt-0.5 ${priority === "urgent" ? "text-red-500" : priority === "high" ? "text-orange-500" : "text-muted-foreground"}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`font-medium text-sm ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {title}
            </p>
            {priority !== "normal" && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${priorityClass}`}>
                <Flag className="h-2.5 w-2.5" />
                {priority}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {post.taskAssignee && (
              <span>Assigned to: {post.taskAssignee.name}</span>
            )}
            {dueDate && (
              <>
                <span>·</span>
                <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                  {isOverdue && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                  Due: {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </>
            )}
          </div>
          {post.case && (
            <Link
              href={`/cases/${post.case.id}`}
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              #{post.case.clientName || post.case.tabsNumber}
            </Link>
          )}
          {post.content && (
            <p className="text-sm text-muted-foreground mt-2">{post.content}</p>
          )}
          {isCompleted && completedAt && (
            <p className="text-xs text-green-600 mt-1">
              Completed {new Date(completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      {!isCompleted && isAssignee && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleComplete}
            disabled={completing}
            className="text-xs"
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            {completing ? "Completing..." : "Mark Complete"}
          </Button>
        </div>
      )}
    </div>
  )
}
