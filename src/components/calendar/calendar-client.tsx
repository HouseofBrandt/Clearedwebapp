"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { AgendaView } from "./agenda-view"
import { MonthView } from "./month-view"
import { AddDeadlineDialog } from "./add-deadline-dialog"

interface SummaryStats {
  overdueCount: number
  thisWeekCount: number
  thisMonthCount: number
  totalCount: number
}

interface CalendarClientProps {
  deadlines: any[]
  users: { id: string; name: string; role: string }[]
  cases: { id: string; tabsNumber: string; clientName: string }[]
  currentUserId: string
  summaryStats: SummaryStats
}

export function CalendarClient({ deadlines, users, cases, currentUserId, summaryStats }: CalendarClientProps) {
  const [userFilter, setUserFilter] = useState("all")

  const filtered = userFilter === "all"
    ? deadlines
    : userFilter === "mine"
      ? deadlines.filter((d) => d.assignedToId === currentUserId)
      : deadlines.filter((d) => d.assignedToId === userFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display-md">Calendar & Deadlines</h1>
        <AddDeadlineDialog cases={cases} users={users} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div className="text-2xl font-medium text-red-600 font-mono tabular-nums">{summaryStats.overdueCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">This Week</div>
          <div className="text-2xl font-medium text-amber-600 font-mono tabular-nums">{summaryStats.thisWeekCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">This Month</div>
          <div className="text-2xl font-medium font-mono tabular-nums">{summaryStats.thisMonthCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Active</div>
          <div className="text-2xl font-medium font-mono tabular-nums">{summaryStats.totalCount}</div>
        </Card>
      </div>

      <Tabs defaultValue="agenda">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deadlines</SelectItem>
              <SelectItem value="mine">My Deadlines</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="agenda" className="mt-4">
          <AgendaView deadlines={filtered} users={users} />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <MonthView deadlines={filtered} users={users} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
