"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { X, ChevronRight } from "lucide-react"

interface ActionItemData {
  id: string
  caseId: string
  caseIdentifier: string
  clientName: string
  priority: "critical" | "high" | "normal"
  action: string
  reason: string
  type: string
}

interface ActionItemsProps {
  items: ActionItemData[]
}

const priorityConfig = {
  critical: { color: "#EF4444", ring: "0 0 0 3px #FEF2F2", label: "Urgent" },
  high: { color: "#3B82F6", ring: "0 0 0 3px #EFF6FF", label: "Medium" },
  normal: { color: "#D97B1E", ring: "0 0 0 3px #FEF5E7", label: "Low" },
}

function ActionItem({ item, onDismiss }: { item: ActionItemData; onDismiss: (id: string) => void }) {
  const [gone, setGone] = useState(false)
  const priority = priorityConfig[item.priority]
  const actionHref = item.type === "review" ? "/review" : `/cases/${item.caseId}`
  const actionLabel = item.type === "review" ? "Review" : "Open case"

  const handleDismiss = useCallback(() => {
    setGone(true)
    setTimeout(() => onDismiss(item.id), 400)
  }, [item.id, onDismiss])

  return (
    <div
      className="group relative flex items-start gap-3.5 py-3.5 px-4 rounded-xl transition-all duration-150 hover:bg-[var(--c-gray-50)]"
      style={{
        borderBottom: "1px solid var(--c-gray-50)",
        opacity: gone ? 0 : 1,
        transform: gone ? "translateX(60px) scale(0.96)" : "translateX(0) scale(1)",
        maxHeight: gone ? 0 : 120,
        marginTop: gone ? 0 : undefined,
        marginBottom: gone ? 0 : undefined,
        overflow: gone ? "hidden" : "visible",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: gone ? "none" : "auto",
      }}
    >
      {/* Priority dot */}
      <div
        className="h-2.5 w-2.5 rounded-full shrink-0 mt-[5px]"
        style={{ background: priority.color, boxShadow: priority.ring }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-medium" style={{ color: "var(--c-gray-400)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
            {item.caseIdentifier}
          </span>
          <span style={{ color: "var(--c-gray-200)" }}>&middot;</span>
          <span className="text-[11px]" style={{ color: "var(--c-gray-300)" }}>{item.clientName}</span>
        </div>
        <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--c-gray-900)" }}>
          {item.action}
        </p>
        {item.reason && (
          <p className="text-[11.5px] mt-0.5 line-clamp-1" style={{ color: "var(--c-gray-400)" }}>
            {item.reason}
          </p>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-all duration-150"
          style={{
            color: "var(--c-navy-950)",
            background: "var(--c-gray-50)",
            border: "1px solid var(--c-gray-100)",
          }}
        >
          {actionLabel}
          <ChevronRight className="h-3 w-3" />
        </Link>
        <button
          onClick={handleDismiss}
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150 hover:bg-[var(--c-gray-100)]"
          style={{ color: "var(--c-gray-300)" }}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function ActionItems({ items: initialItems }: ActionItemsProps) {
  const [items, setItems] = useState(initialItems)
  const [dismissingAll, setDismissingAll] = useState(false)

  const handleDismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handleDismissAll = useCallback(() => {
    setDismissingAll(true)
    // Stagger dismissals at 100ms intervals
    items.forEach((_, i) => {
      setTimeout(() => {
        setItems((prev) => prev.slice(1))
      }, (i + 1) * 100)
    })
    setTimeout(() => setDismissingAll(false), items.length * 100 + 500)
  }, [items])

  if (items.length === 0) return null

  return (
    <section className="mb-8 action-items-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2.5">
          <span className="text-overline">Action items</span>
          <span
            className="inline-flex items-center justify-center h-[18px] min-w-[18px] rounded-full px-1.5 text-[10px] font-semibold text-white"
            style={{ background: "#EF4444" }}
          >
            {items.length}
          </span>
        </div>
        <button
          onClick={handleDismissAll}
          disabled={dismissingAll}
          className="text-[11.5px] font-medium transition-colors duration-150 hover:text-[var(--c-danger)]"
          style={{ color: "var(--c-gray-300)" }}
        >
          Dismiss all
        </button>
      </div>

      {/* Cards */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface-primary)",
          border: "1px solid var(--c-gray-100)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        {items.map((item) => (
          <ActionItem key={item.id} item={item} onDismiss={handleDismiss} />
        ))}
      </div>
    </section>
  )
}
