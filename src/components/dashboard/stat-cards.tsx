"use client"

import { CountUp } from "@/components/ui/count-up"
import { ClipboardCheck, Calendar, FolderOpen, ListTodo } from "lucide-react"

interface StatCardsProps {
  pendingReviews: number
  deadlinesThisWeek: number
  activeCases: number
  openTasks: number
}

const cards = [
  { key: "pendingReviews", label: "Awaiting Review", icon: ClipboardCheck, urgency: "critical" as const, accentColor: "#D93025", accentSoft: "rgba(217,48,37,0.06)", accentBorder: "rgba(217,48,37,0.12)" },
  { key: "deadlinesThisWeek", label: "Deadlines This Week", icon: Calendar, urgency: "warning" as const, accentColor: "#D97706", accentSoft: "rgba(217,119,6,0.05)", accentBorder: "rgba(217,119,6,0.10)" },
  { key: "activeCases", label: "Active Cases", icon: FolderOpen, urgency: "neutral" as const, accentColor: "var(--c-gray-400)", accentSoft: "transparent", accentBorder: "var(--c-gray-100)" },
  { key: "openTasks", label: "Open Tasks", icon: ListTodo, urgency: "neutral" as const, accentColor: "var(--c-gray-400)", accentSoft: "transparent", accentBorder: "var(--c-gray-100)" },
] as const

export function StatCards({ pendingReviews, deadlinesThisWeek, activeCases, openTasks }: StatCardsProps) {
  const values: Record<string, number> = { pendingReviews, deadlinesThisWeek, activeCases, openTasks }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, i) => {
        const val = values[card.key]
        const hasValue = val > 0
        const isUrgent = card.urgency !== "neutral" && hasValue
        const Icon = card.icon
        return (
          <div key={card.key} className="stat-card-enter relative overflow-hidden rounded-[14px] p-5 transition-all duration-200"
            style={{ background: isUrgent ? `linear-gradient(135deg, #FFFFFF 60%, ${card.accentSoft} 100%)` : "var(--surface-primary)", border: `1px solid ${isUrgent ? card.accentBorder : "var(--c-gray-100)"}`, boxShadow: "var(--shadow-1)", animationDelay: `${i * 80}ms` }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-2)"; e.currentTarget.style.transform = "translateY(-1px)" }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-1)"; e.currentTarget.style.transform = "translateY(0)" }}>
            <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none" style={{ borderRadius: "0 14px 0 40px", background: isUrgent ? `linear-gradient(135deg, transparent 30%, ${card.accentSoft})` : "linear-gradient(135deg, transparent 30%, var(--c-gray-50))", opacity: 0.7 }} />
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-[7px]" style={{ background: isUrgent ? card.accentSoft : "var(--c-gray-50)", border: `1px solid ${isUrgent ? card.accentBorder : "var(--c-gray-100)"}` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: isUrgent ? card.accentColor : "var(--c-gray-400)" }} />
              </div>
              <span className="text-overline" style={{ color: isUrgent ? card.accentColor : undefined }}>{card.label}</span>
            </div>
            <CountUp className="stat-number block relative z-10" style={{ color: isUrgent ? card.accentColor : "var(--c-gray-800)" }} value={val} duration={800} delay={200 + i * 80} flashColor={isUrgent ? card.accentColor : undefined} />
            {isUrgent && <div className="absolute bottom-3 right-3 w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: card.accentColor, opacity: 0.4 }} />}
          </div>
        )
      })}
    </div>
  )
}
