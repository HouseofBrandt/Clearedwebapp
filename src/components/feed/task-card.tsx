"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle, Circle } from "lucide-react"

interface TaskCardProps {
  post: any
  currentUserId: string
  onComplete?: () => void
}

export function TaskCard({ post, currentUserId, onComplete }: TaskCardProps) {
  const [completing, setCompleting] = useState(false)
  const isAssignee = post.taskAssigneeId === currentUserId

  async function handleComplete() {
    setCompleting(true)
    try {
      const res = await fetch(`/api/feed/${post.id}/complete`, { method: "PATCH" })
      if (res.ok) onComplete?.()
    } finally {
      setCompleting(false)
    }
  }

  const dueDate = post.taskDueDate ? new Date(post.taskDueDate) : null
  const isOverdue = dueDate && !post.taskCompleted && dueDate < new Date()

  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-start gap-2">
        {post.taskCompleted ? (
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${post.taskCompleted ? "line-through text-muted-foreground" : ""}`}>
            {post.taskTitle}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {post.taskAssignee && (
              <span>Assigned to: {post.taskAssignee.name}</span>
            )}
            {dueDate && (
              <>
                <span>·</span>
                <span className={isOverdue ? "text-red-500 font-medium" : ""}>
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
          {post.taskCompleted && post.taskCompletedAt && (
            <p className="text-xs text-green-600 mt-1">
              Completed {new Date(post.taskCompletedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      {!post.taskCompleted && isAssignee && (
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
