"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import Link from "next/link"
import { Archive } from "lucide-react"
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
}

const statusStyles: Record<string, string> = {
  QUEUED: "bg-c-gray-100 text-c-gray-700",
  PROCESSING: "bg-c-info-soft text-c-teal",
  READY_FOR_REVIEW: "bg-c-warning-soft text-c-warning",
  APPROVED: "bg-c-success-soft text-c-success",
  REJECTED: "bg-c-danger-soft text-c-danger",
}

/** Statuses where a task's parent assignment can be archived */
const ARCHIVABLE_TASK_STATUSES = ["APPROVED", "REJECTED"]

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

export function BanjoHistory({ tasks }: BanjoHistoryProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const [archivingId, setArchivingId] = useState<string | null>(null)

  if (tasks.length === 0) return null

  async function handleArchive(e: React.MouseEvent, assignmentId: string) {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm("Archive this assignment? The deliverables will remain in the review queue.")) return

    setArchivingId(assignmentId)
    try {
      const res = await fetch(`/api/banjo/${assignmentId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to archive")
      }
      addToast({ title: "Assignment archived" })
      router.refresh()
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Previous Assignments ({tasks.length})
      </p>
      <div className="space-y-1">
        {tasks.map((task) => {
          const canArchive =
            task.banjoAssignmentId &&
            ARCHIVABLE_TASK_STATUSES.includes(task.status)

          return (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <Link
                href={`/review/${task.id}`}
                className="flex-1 min-w-0"
              >
                <p className="text-sm font-medium truncate">
                  {task.banjoStepLabel || formatTaskType(task.taskType)}
                </p>
                {!task.banjoAssignmentId && (
                  <p className="text-xs text-muted-foreground">Standalone</p>
                )}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={statusStyles[task.status] || ""} variant="secondary">
                  {task.status === "READY_FOR_REVIEW" ? "In Review" : task.status.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(task.createdAt)}</span>
                {canArchive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-c-danger"
                    title="Archive assignment"
                    disabled={archivingId === task.banjoAssignmentId}
                    onClick={(e) => handleArchive(e, task.banjoAssignmentId!)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
