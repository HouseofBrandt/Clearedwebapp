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
import { AgendaView } from "./agenda-view"
import { MonthView } from "./month-view"
import { AddDeadlineDialog } from "./add-deadline-dialog"

interface CalendarClientProps {
  deadlines: any[]
  users: { id: string; name: string; role: string }[]
  cases: { id: string; caseNumber: string; clientName: string }[]
  currentUserId: string
}

export function CalendarClient({ deadlines, users, cases, currentUserId }: CalendarClientProps) {
  const [userFilter, setUserFilter] = useState("all")

  const filtered = userFilter === "all"
    ? deadlines
    : userFilter === "mine"
      ? deadlines.filter((d) => d.assignedToId === currentUserId)
      : deadlines.filter((d) => d.assignedToId === userFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Calendar & Deadlines</h1>
        <AddDeadlineDialog cases={cases} users={users} />
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
