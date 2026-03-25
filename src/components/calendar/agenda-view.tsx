"use client"

import { useState } from "react"
import { DeadlineCard } from "./deadline-card"
import { Calendar, ChevronDown, ChevronRight } from "lucide-react"

interface AgendaViewProps {
  deadlines: any[]
  users: { id: string; name: string; role: string }[]
}

function groupDeadlines(deadlines: any[]) {
  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const groups: { key: string; label: string; color: string; deadlines: any[]; defaultOpen: boolean }[] = [
    { key: "overdue", label: "OVERDUE", color: "text-red-600", deadlines: [], defaultOpen: true },
    { key: "this-week", label: "THIS WEEK", color: "text-amber-600", deadlines: [], defaultOpen: true },
    { key: "next-30", label: "NEXT 30 DAYS", color: "text-green-600", deadlines: [], defaultOpen: true },
    { key: "later", label: "LATER", color: "text-muted-foreground", deadlines: [], defaultOpen: true },
    { key: "completed", label: "COMPLETED RECENTLY", color: "text-muted-foreground", deadlines: [], defaultOpen: false },
  ]

  for (const d of deadlines) {
    const due = new Date(d.dueDate)
    if (d.status === "COMPLETED") {
      if (d.completedDate && new Date(d.completedDate) >= fourteenDaysAgo) {
        groups[4].deadlines.push(d)
      }
    } else if (due < now) {
      groups[0].deadlines.push(d)
    } else if (due <= sevenDays) {
      groups[1].deadlines.push(d)
    } else if (due <= thirtyDays) {
      groups[2].deadlines.push(d)
    } else {
      groups[3].deadlines.push(d)
    }
  }

  return groups.filter((g) => g.deadlines.length > 0)
}

export function AgendaView({ deadlines, users }: AgendaViewProps) {
  const groups = groupDeadlines(deadlines)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const g of groups) {
      if (!g.defaultOpen) init[g.key] = true
    }
    return init
  })

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-slate-300 mb-4" />
        <h3 className="text-sm font-medium text-slate-900">No deadlines tracked</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Add your first deadline to start tracking CSEDs, filing deadlines, appeal windows, and more.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <button
            className="flex items-center gap-2 mb-3 w-full text-left"
            onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
          >
            {collapsed[group.key] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className={`text-sm font-medium ${group.color}`}>
              {group.label} ({group.deadlines.length})
            </span>
          </button>
          {!collapsed[group.key] && (
            <div className="space-y-2 ml-6">
              {group.deadlines.map((d) => (
                <DeadlineCard key={d.id} deadline={d} users={users} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
