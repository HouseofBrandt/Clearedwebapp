"use client"

import { CountUp } from "@/components/ui/count-up"

interface StatCardsProps {
  pendingReviews: number
  deadlinesThisWeek: number
  activeCases: number
  openTasks: number
}

const cards = [
  { key: "pendingReviews", label: "Awaiting Review", labelColor: "var(--c-danger)", flashColor: "var(--c-danger)" },
  { key: "deadlinesThisWeek", label: "Deadlines This Week", labelColor: "var(--c-warning)", flashColor: "var(--c-warning)" },
  { key: "activeCases", label: "Active Cases", labelColor: undefined, flashColor: undefined },
  { key: "openTasks", label: "Open Tasks", labelColor: undefined, flashColor: undefined },
] as const

export function StatCards({ pendingReviews, deadlinesThisWeek, activeCases, openTasks }: StatCardsProps) {
  const values: Record<string, number> = { pendingReviews, deadlinesThisWeek, activeCases, openTasks }

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {cards.map((card, i) => {
        const val = values[card.key]
        const hasValue = val > 0
        const numberColor = card.flashColor && hasValue ? card.flashColor : "var(--c-gray-700)"

        return (
          <div
            key={card.key}
            className="stat-card-enter rounded-xl border border-[var(--c-gray-100)] p-5 bg-white hover:border-[var(--c-gray-200)] transition-all duration-150"
            style={{
              boxShadow: "var(--shadow-1)",
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div className="text-overline" style={{ color: card.labelColor }}>
              {card.label}
            </div>
            <CountUp
              className="stat-number mt-1.5 block"
              style={{ color: numberColor }}
              value={val}
              duration={800}
              delay={200 + i * 80}
              flashColor={card.flashColor && hasValue ? card.flashColor : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
