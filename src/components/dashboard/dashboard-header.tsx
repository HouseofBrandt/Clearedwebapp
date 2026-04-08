"use client"

import { Search } from "lucide-react"

interface DashboardHeaderProps {
  userName: string
  actionItemCount: number
}

export function DashboardHeader({ userName, actionItemCount }: DashboardHeaderProps) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = userName.split(" ")[0]

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const subtitle = actionItemCount > 0
    ? `${dateStr} \u2014 ${actionItemCount} item${actionItemCount !== 1 ? "s" : ""} need attention`
    : `${dateStr} \u2014 you're all caught up`

  return (
    <div className="flex items-start justify-between gap-6 mb-8 header-enter">
      {/* Greeting */}
      <div className="min-w-0">
        <h1
          className="text-display-md leading-snug"
          style={{ color: "var(--c-gray-900)" }}
        >
          {greeting}, {firstName}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--c-gray-400)" }}>
          {subtitle}
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 hidden md:block">
        <div
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 cursor-pointer transition-all duration-150 hover:border-[var(--c-gray-200)]"
          style={{
            background: "var(--c-white)",
            border: "1px solid var(--c-gray-100)",
            boxShadow: "var(--shadow-xs)",
            minWidth: 220,
          }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--c-gray-300)" }} />
          <span className="text-[13px]" style={{ color: "var(--c-gray-300)" }}>
            Search cases, docs...
          </span>
          <kbd
            className="ml-auto text-[10px] font-medium rounded px-1.5 py-0.5"
            style={{
              color: "var(--c-gray-300)",
              background: "var(--c-gray-50)",
              border: "1px solid var(--c-gray-100)",
            }}
          >
            /
          </kbd>
        </div>
      </div>
    </div>
  )
}
