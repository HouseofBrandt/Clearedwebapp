"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/date-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { CalendarPlus, Loader2 } from "lucide-react"
import { DEADLINE_PRIORITY_COLORS } from "@/types"

interface SuggestedDeadline {
  type: string
  title: string
  dueDate: string | null
  priority: string
  context: string
}

interface DeadlineSuggestionsProps {
  suggestions: SuggestedDeadline[]
  caseId: string
  taskId: string
}

export function DeadlineSuggestions({ suggestions, caseId, taskId }: DeadlineSuggestionsProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(suggestions.map((_, i) => i)))
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  if (suggestions.length === 0) return null

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleAddSelected() {
    const toAdd = suggestions.filter((_, i) => selected.has(i)).filter((s) => s.dueDate)
    if (toAdd.length === 0) {
      addToast({ title: "No deadlines with dates selected", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      for (const s of toAdd) {
        await fetch("/api/deadlines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId,
            type: s.type,
            title: s.title,
            dueDate: s.dueDate,
            priority: s.priority,
            source: "ai_analysis",
            sourceTaskId: taskId,
            description: s.context,
          }),
        })
      }
      addToast({ title: `${toAdd.length} deadline(s) added to calendar` })
      router.refresh()
    } catch {
      addToast({ title: "Error adding deadlines", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-c-teal/20 bg-c-info-soft/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarPlus className="h-4 w-4" />
          Suggested Deadlines (from analysis)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((s, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggleSelect(i)}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                {s.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    — Due {formatDate(s.dueDate, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {!s.dueDate && (
                  <span className="text-xs text-c-warning">(date TBD)</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${DEADLINE_PRIORITY_COLORS[s.priority] || ""}`}>
                  {s.priority}
                </Badge>
                <span className="text-xs text-muted-foreground">{s.context}</span>
              </div>
            </div>
          </label>
        ))}
        <Button
          size="sm"
          onClick={handleAddSelected}
          disabled={submitting || selected.size === 0}
          className="mt-2"
        >
          {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CalendarPlus className="mr-1 h-3 w-3" />}
          Add Selected to Calendar
        </Button>
      </CardContent>
    </Card>
  )
}
