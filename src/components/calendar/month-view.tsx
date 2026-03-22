"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DEADLINE_PRIORITY_DOTS, DEADLINE_TYPE_LABELS } from "@/types"
import { formatDate as formatDateUtil } from "@/lib/date-utils"

interface MonthViewProps {
  deadlines: any[]
  users: { id: string; name: string; role: string }[]
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatDate(d: Date) {
  return formatDateUtil(d, { month: "short", day: "numeric", year: "numeric" })
}

export function MonthView({ deadlines, users }: MonthViewProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const monthName = formatDateUtil(new Date(year, month), { month: "long", year: "numeric" })

  // Group deadlines by day
  const deadlinesByDay: Record<number, any[]> = {}
  for (const d of deadlines) {
    const due = new Date(d.dueDate)
    if (due.getFullYear() === year && due.getMonth() === month) {
      const day = due.getDate()
      if (!deadlinesByDay[day]) deadlinesByDay[day] = []
      deadlinesByDay[day].push(d)
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
    setSelectedDay(null)
  }

  const today = now.getDate()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Fill to complete row
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedDeadlines = selectedDay ? (deadlinesByDay[selectedDay] || []) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">{monthName}</h3>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dayDeadlines = day ? (deadlinesByDay[day] || []) : []
          const isToday = isCurrentMonth && day === today
          const isSelected = day === selectedDay

          return (
            <div
              key={i}
              className={`bg-card p-2 min-h-[80px] cursor-pointer transition-colors hover:bg-muted/50 ${isSelected ? "ring-2 ring-primary ring-inset" : ""} ${!day ? "bg-muted/30" : ""}`}
              onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
            >
              {day && (
                <>
                  <span className={`text-sm ${isToday ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold" : ""}`}>
                    {day}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {dayDeadlines.slice(0, 3).map((d: any) => (
                      <div
                        key={d.id}
                        className={`h-2 w-2 rounded-full ${DEADLINE_PRIORITY_DOTS[d.priority] || "bg-gray-400"}`}
                        title={d.title}
                      />
                    ))}
                    {dayDeadlines.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayDeadlines.length - 3}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {selectedDay && (
        <div className="rounded-lg border p-4">
          <h4 className="font-medium mb-3">
            {formatDateUtil(new Date(year, month, selectedDay), { weekday: "long", month: "long", day: "numeric" })}
          </h4>
          {selectedDeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deadlines on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDeadlines.map((d: any) => (
                <Link key={d.id} href={`/cases/${d.case?.id || d.caseId}`} className="block">
                  <div className="flex items-center gap-3 rounded-md p-2 hover:bg-muted transition-colors">
                    <div className={`h-3 w-3 rounded-full shrink-0 ${DEADLINE_PRIORITY_DOTS[d.priority] || "bg-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.case?.tabsNumber} · {DEADLINE_TYPE_LABELS[d.type] || d.type}
                        {d.assignedTo ? ` · ${d.assignedTo.name}` : ""}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
