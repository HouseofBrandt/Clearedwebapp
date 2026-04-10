"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Check, Clock, AlertCircle, ArrowUpRight, Loader2 } from "lucide-react"

/**
 * TaskCenterClient
 * ----------------
 * Renders the three task tabs — Open / Completed / Created by me — with a
 * quiet editorial layout that matches the dashboard. Tasks can be marked
 * complete inline (PATCH /api/tasks/[taskId]) and clicked to open the
 * associated case.
 */

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  assignee?: { id: string; name: string } | null
  createdBy?: { id: string; name: string } | null
  case?: { id: string; tabsNumber: string; clientName: string } | null
}

interface TaskCenterClientProps {
  openTasks: Task[]
  completedTasks: Task[]
  createdByMeTasks: Task[]
  currentUserId: string
}

type Tab = "open" | "completed" | "created"

const TABS: { id: Tab; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
  { id: "created", label: "Created by me" },
]

const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  urgent: { label: "Urgent", color: "var(--c-pastel-red-fg)", bg: "var(--c-pastel-red-bg)" },
  high: { label: "High", color: "var(--c-pastel-amber-fg)", bg: "var(--c-pastel-amber-bg)" },
  normal: { label: "Normal", color: "var(--c-pastel-blue-fg)", bg: "var(--c-pastel-blue-bg)" },
  low: { label: "Low", color: "var(--c-gray-500)", bg: "var(--c-gray-50)" },
}

function formatDue(iso: string | null): { text: string; overdue: boolean; soon: boolean } {
  if (!iso) return { text: "No due date", overdue: false, soon: false }
  const due = new Date(iso)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)}d`, overdue: true, soon: false }
  if (diffDays === 0) return { text: "Due today", overdue: false, soon: true }
  if (diffDays === 1) return { text: "Due tomorrow", overdue: false, soon: true }
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, overdue: false, soon: true }
  return {
    text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    overdue: false,
    soon: false,
  }
}

export function TaskCenterClient({
  openTasks,
  completedTasks,
  createdByMeTasks,
  currentUserId: _currentUserId,
}: TaskCenterClientProps) {
  const [tab, setTab] = useState<Tab>("open")
  const [open, setOpen] = useState<Task[]>(openTasks)
  const [completed, setCompleted] = useState<Task[]>(completedTasks)
  const [createdByMe] = useState<Task[]>(createdByMeTasks)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const activeTasks =
    tab === "open" ? open : tab === "completed" ? completed : createdByMe

  const handleComplete = useCallback(
    async (taskId: string) => {
      setCompleting((prev) => new Set(prev).add(taskId))
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        })
        if (res.ok) {
          const task = open.find((t) => t.id === taskId)
          if (task) {
            const updated: Task = {
              ...task,
              status: "completed",
              completedAt: new Date().toISOString(),
            }
            setOpen((prev) => prev.filter((t) => t.id !== taskId))
            setCompleted((prev) => [updated, ...prev])
          }
        }
      } finally {
        setCompleting((prev) => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
      }
    },
    [open]
  )

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex items-center gap-6 mb-8"
        style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}
      >
        {TABS.map((t) => {
          const count =
            t.id === "open"
              ? open.length
              : t.id === "completed"
              ? completed.length
              : createdByMe.length
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="pb-3 transition-colors"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: isActive ? "var(--c-cleared-green)" : "var(--c-gray-400)",
                borderBottom: isActive
                  ? "1.5px solid var(--c-cleared-green)"
                  : "1.5px solid transparent",
                marginBottom: "-0.5px",
              }}
            >
              {t.label}
              {count > 0 && (
                <span
                  className="ml-2"
                  style={{
                    color: isActive ? "var(--c-cleared-green)" : "var(--c-gray-300)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Task list */}
      {activeTasks.length === 0 ? (
        <div className="py-16 text-center">
          <p
            style={{
              fontFamily: "var(--font-editorial)",
              fontSize: 20,
              fontWeight: 300,
              fontStyle: "italic",
              color: "var(--c-gray-300)",
              lineHeight: 1.5,
            }}
          >
            {tab === "open"
              ? "Nothing on your plate."
              : tab === "completed"
              ? "No completed tasks yet."
              : "You haven\u2019t assigned any tasks yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {activeTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showCompleteButton={tab === "open"}
              completing={completing.has(t.id)}
              onComplete={() => handleComplete(t.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Task row ───────────────────────────────────────────────────

function TaskRow({
  task,
  showCompleteButton,
  completing,
  onComplete,
}: {
  task: Task
  showCompleteButton: boolean
  completing: boolean
  onComplete: () => void
}) {
  const due = formatDue(task.dueDate)
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal
  const isCompleted = task.status === "completed"

  return (
    <li
      className="flex items-start gap-4 dash-card group"
      style={{
        padding: "18px 20px",
        opacity: isCompleted ? 0.6 : 1,
      }}
    >
      {/* Complete checkbox */}
      {showCompleteButton ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="flex items-center justify-center shrink-0 mt-0.5 transition-all"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "1.5px solid var(--c-gray-200)",
            background: "var(--c-white)",
            cursor: completing ? "wait" : "pointer",
          }}
          onMouseEnter={(e) => {
            if (!completing) {
              e.currentTarget.style.borderColor = "var(--c-cleared-green)"
              e.currentTarget.style.background = "var(--c-cleared-green-tint)"
            }
          }}
          onMouseLeave={(e) => {
            if (!completing) {
              e.currentTarget.style.borderColor = "var(--c-gray-200)"
              e.currentTarget.style.background = "var(--c-white)"
            }
          }}
          aria-label="Mark complete"
        >
          {completing && (
            <Loader2
              className="h-3 w-3 animate-spin"
              style={{ color: "var(--c-cleared-green)" }}
            />
          )}
        </button>
      ) : (
        <div
          className="flex items-center justify-center shrink-0 mt-0.5"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: isCompleted ? "var(--c-cleared-green)" : "var(--c-gray-100)",
          }}
        >
          {isCompleted && <Check className="h-3 w-3" strokeWidth={3} style={{ color: "var(--c-white)" }} />}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--c-gray-800)",
                lineHeight: 1.4,
                textDecoration: isCompleted ? "line-through" : "none",
              }}
            >
              {task.title}
            </h3>
            {task.description && (
              <p
                className="mt-1 line-clamp-2"
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 13,
                  fontWeight: 300,
                  color: "var(--c-gray-500)",
                  lineHeight: 1.6,
                }}
              >
                {task.description}
              </p>
            )}
          </div>
          {task.case && (
            <Link
              href={`/cases/${task.case.id}`}
              className="shrink-0 flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100 hover:underline"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--c-cleared-green)",
              }}
            >
              Open
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            </Link>
          )}
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {/* Due */}
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: "var(--font-dm)",
              fontSize: 11,
              fontWeight: 400,
              color: due.overdue
                ? "var(--c-pastel-red-fg)"
                : due.soon
                ? "var(--c-pastel-amber-fg)"
                : "var(--c-gray-400)",
            }}
          >
            {due.overdue ? (
              <AlertCircle className="h-3 w-3" strokeWidth={1.75} />
            ) : (
              <Clock className="h-3 w-3" strokeWidth={1.5} />
            )}
            {due.text}
          </span>

          {/* Priority chip */}
          {task.priority && task.priority !== "normal" && (
            <span
              className="inline-flex items-center rounded-full"
              style={{
                padding: "2px 8px",
                fontFamily: "var(--font-dm)",
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: priorityCfg.bg,
                color: priorityCfg.color,
              }}
            >
              {priorityCfg.label}
            </span>
          )}

          {/* Case ref */}
          {task.case && (
            <span
              className="flex items-center gap-1"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 400,
                color: "var(--c-gray-400)",
              }}
            >
              <span>{task.case.clientName || task.case.tabsNumber}</span>
              <span className="font-mono" style={{ color: "var(--c-gray-300)" }}>
                · {task.case.tabsNumber}
              </span>
            </span>
          )}

          {/* Created by */}
          {task.createdBy && task.createdBy.id !== task.assignee?.id && (
            <span
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 400,
                color: "var(--c-gray-400)",
              }}
            >
              from {task.createdBy.name}
            </span>
          )}

          {/* Assignee (for created-by-me tab) */}
          {task.assignee && task.createdBy?.id !== task.assignee.id && (
            <span
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 400,
                color: "var(--c-gray-400)",
              }}
            >
              → {task.assignee.name}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
