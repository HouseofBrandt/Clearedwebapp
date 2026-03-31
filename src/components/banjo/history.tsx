"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { TASK_TYPE_LABELS } from "@/types"

interface HistoryTask {
  id: string
  taskType: string
  status: string
  createdAt: string
  banjoAssignmentId?: string | null
  banjoStepLabel?: string | null
}

interface BanjoHistoryProps {
  tasks: HistoryTask[]
  onAssignmentDeleted?: () => void
}

const statusStyles: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  READY_FOR_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
}

function formatTaskType(taskType: string): string {
  return TASK_TYPE_LABELS[taskType as keyof typeof TASK_TYPE_LABELS] || taskType.replace(/_/g, " ")
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHr / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHr > 0) return `${diffHr}h ago`
  const diffMin = Math.floor(diffMs / (1000 * 60))
  if (diffMin > 0) return `${diffMin}m ago`
  return "just now"
}

export function BanjoHistory({ tasks, onAssignmentDeleted }: BanjoHistoryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (tasks.length === 0) return null

  // Group tasks by banjoAssignmentId to enable assignment-level delete
  const assignmentIds = Array.from(new Set(tasks.filter((t) => t.banjoAssignmentId).map((t) => t.banjoAssignmentId!)))

  async function handleDelete(assignmentId: string) {
    setDeletingId(assignmentId)
    try {
      const res = await fetch(`/api/banjo/${assignmentId}`, { method: "DELETE" })
      if (res.ok) {
        setConfirmDeleteId(null)
        onAssignmentDeleted?.()
      }
    } catch { /* ignore */ }
    setDeletingId(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Previous Assignments ({tasks.length})
      </p>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-1">
            <Link
              href={`/review/${task.id}`}
              className="flex-1 flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {task.banjoStepLabel || formatTaskType(task.taskType)}
                </p>
                {!task.banjoAssignmentId && (
                  <p className="text-xs text-muted-foreground">Standalone</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={statusStyles[task.status] || ""} variant="secondary">
                  {task.status === "READY_FOR_REVIEW" ? "In Review" : task.status.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(task.createdAt)}</span>
              </div>
            </Link>
            {/* Delete button (C7) — only for Banjo assignments, not standalone */}
            {task.banjoAssignmentId && (
              confirmDeleteId === task.banjoAssignmentId ? (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleDelete(task.banjoAssignmentId!)}
                    disabled={deletingId === task.banjoAssignmentId}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {deletingId === task.banjoAssignmentId ? "..." : "Yes"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(task.banjoAssignmentId!)}
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete assignment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
