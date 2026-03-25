"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CalendarDays,
  Plus,
  Trash2,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface UserOption {
  id: string
  name: string
  email: string
}

interface ActionItem {
  description: string
  assigneeId: string
  dueDate: string
  status: string
}

interface GovernanceMeeting {
  id: string
  meetingDate: string
  attendeeIds: string[]
  attendees: UserOption[]
  agenda: string
  decisions: string
  actionItems: ActionItem[]
  quarter: string
  createdBy: UserOption
  createdAt: string
}

interface GovernanceMeetingsProps {
  users: UserOption[]
}

// ── Pre-populated agenda template ──────────────────────────────────

const AGENDA_TEMPLATE = `1. Review of Previous Meeting Action Items
2. Compliance Dashboard Review
   - Overall compliance score
   - Open compliance issues (CRITICAL/HIGH)
   - Health check results summary
3. Security Incident Review
   - New incidents since last meeting
   - Status of open incidents
4. Policy & Training Updates
   - Policy acknowledgment status
   - Security training completion rates
5. Vendor Risk Assessment
   - SOC 2 report status for key vendors
   - DPA renewal schedule
6. Regulatory Updates
   - IRS guidance changes
   - Circular 230 updates
   - State privacy law developments
7. Risk Register Review
   - New risks identified
   - Changes to existing risk ratings
8. Action Items & Next Steps`

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getCurrentQuarter(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `${now.getFullYear()}-Q${q}`
}

// ── Component ──────────────────────────────────────────────────────

export function GovernanceMeetings({ users }: GovernanceMeetingsProps) {
  const [meetings, setMeetings] = useState<GovernanceMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [meetingDate, setMeetingDate] = useState("")
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
  const [agenda, setAgenda] = useState(AGENDA_TEMPLATE)
  const [decisions, setDecisions] = useState("")
  const [actionItems, setActionItems] = useState<ActionItem[]>([
    { description: "", assigneeId: "", dueDate: "", status: "OPEN" },
  ])
  const [quarter, setQuarter] = useState(getCurrentQuarter())

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/governance")
      if (res.ok) {
        const data = await res.json()
        setMeetings(data.meetings)
      }
    } catch (err) {
      console.error("Failed to fetch governance meetings:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  function resetForm() {
    setMeetingDate("")
    setSelectedAttendees([])
    setAgenda(AGENDA_TEMPLATE)
    setDecisions("")
    setActionItems([{ description: "", assigneeId: "", dueDate: "", status: "OPEN" }])
    setQuarter(getCurrentQuarter())
    setError(null)
  }

  function addActionItem() {
    setActionItems([...actionItems, { description: "", assigneeId: "", dueDate: "", status: "OPEN" }])
  }

  function removeActionItem(index: number) {
    if (actionItems.length <= 1) return
    setActionItems(actionItems.filter((_, i) => i !== index))
  }

  function updateActionItem(index: number, field: keyof ActionItem, value: string) {
    const updated = [...actionItems]
    updated[index] = { ...updated[index], [field]: value }
    setActionItems(updated)
  }

  function toggleAttendee(userId: string) {
    setSelectedAttendees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  async function handleSubmit() {
    if (!meetingDate) {
      setError("Meeting date is required.")
      return
    }
    if (selectedAttendees.length === 0) {
      setError("At least one attendee is required.")
      return
    }
    if (!agenda.trim()) {
      setError("Agenda is required.")
      return
    }
    if (!decisions.trim()) {
      setError("Decisions field is required.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingDate,
          attendeeIds: selectedAttendees,
          agenda,
          decisions,
          actionItems: actionItems.filter((item) => item.description.trim()),
          quarter,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create meeting record")
      }

      resetForm()
      setShowForm(false)
      fetchMeetings()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-[#1B3A5C]" />
          <div>
            <h2 className="text-lg font-semibold">Governance Meeting Records</h2>
            <p className="text-sm text-muted-foreground">
              Quarterly compliance governance meeting documentation
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}>
          <Plus className="h-4 w-4 mr-1" />
          New Meeting Record
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card className="border-[#1B3A5C]/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Record Governance Meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Date & Quarter Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="meetingDate">Meeting Date</Label>
                <Input
                  id="meetingDate"
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quarter">Quarter</Label>
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Q1", "Q2", "Q3", "Q4"].map((q) => {
                      const year = new Date().getFullYear()
                      return (
                        <SelectItem key={q} value={`${year}-${q}`}>
                          {year}-{q}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Attendees */}
            <div className="space-y-2">
              <Label>
                <Users className="h-3.5 w-3.5 inline mr-1" />
                Attendees ({selectedAttendees.length} selected)
              </Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-md border bg-white min-h-[42px]">
                {users.map((user) => {
                  const selected = selectedAttendees.includes(user.id)
                  return (
                    <button
                      key={user.id}
                      onClick={() => toggleAttendee(user.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected
                          ? "bg-[#1B3A5C] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {user.name || user.email}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Agenda */}
            <div className="space-y-2">
              <Label htmlFor="agenda">Agenda</Label>
              <Textarea
                id="agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            {/* Decisions */}
            <div className="space-y-2">
              <Label htmlFor="decisions">Decisions</Label>
              <Textarea
                id="decisions"
                value={decisions}
                onChange={(e) => setDecisions(e.target.value)}
                rows={4}
                placeholder="Document key decisions made during the meeting..."
              />
            </div>

            {/* Action Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  <ClipboardList className="h-3.5 w-3.5 inline mr-1" />
                  Action Items
                </Label>
                <Button variant="outline" size="sm" onClick={addActionItem}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </div>

              {actionItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 rounded-md border bg-gray-50">
                  <div className="col-span-5">
                    <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateActionItem(i, "description", e.target.value)}
                      placeholder="Action item description..."
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs text-muted-foreground mb-1 block">Assignee</Label>
                    <Select
                      value={item.assigneeId}
                      onValueChange={(val) => updateActionItem(i, "assigneeId", val)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs text-muted-foreground mb-1 block">Due Date</Label>
                    <Input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) => updateActionItem(i, "dueDate", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-center pb-1">
                    <button
                      onClick={() => removeActionItem(i)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      disabled={actionItems.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {submitting ? "Saving..." : "Save Meeting Record"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meeting List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading meetings...</p>
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No governance meetings recorded yet. Create your first meeting record above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-24">Quarter</TableHead>
                  <TableHead>Attendees</TableHead>
                  <TableHead className="w-28">Action Items</TableHead>
                  <TableHead className="w-32">Recorded By</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meetings.map((meeting) => {
                  const isExpanded = expandedMeetingId === meeting.id
                  const items = meeting.actionItems as ActionItem[]
                  return (
                    <>
                      <TableRow
                        key={meeting.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedMeetingId(isExpanded ? null : meeting.id)
                        }
                      >
                        <TableCell className="font-medium text-sm">
                          {formatDate(meeting.meetingDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {meeting.quarter}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {meeting.attendees.map((a: any) => (
                              <span
                                key={a.id}
                                className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700"
                              >
                                {a.name || a.email}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {items.length} item{items.length !== 1 ? "s" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {meeting.createdBy.name || meeting.createdBy.email}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${meeting.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/20 p-0">
                            <div className="p-5 space-y-4">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    Agenda
                                  </h4>
                                  <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground bg-white p-3 rounded-md border">
                                    {meeting.agenda}
                                  </pre>
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    Decisions
                                  </h4>
                                  <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground bg-white p-3 rounded-md border">
                                    {meeting.decisions}
                                  </pre>
                                </div>
                              </div>

                              {items.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    Action Items
                                  </h4>
                                  <div className="space-y-2">
                                    {items.map((item, i) => {
                                      const assignee = users.find(
                                        (u) => u.id === item.assigneeId
                                      )
                                      return (
                                        <div
                                          key={i}
                                          className="flex items-center gap-3 p-2.5 rounded-md bg-white border text-sm"
                                        >
                                          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-[#1B3A5C] text-white text-[10px] font-bold flex-shrink-0">
                                            {i + 1}
                                          </span>
                                          <span className="flex-1">
                                            {item.description}
                                          </span>
                                          {assignee && (
                                            <Badge variant="outline" className="text-xs">
                                              {assignee.name || assignee.email}
                                            </Badge>
                                          )}
                                          {item.dueDate && (
                                            <span className="text-xs text-muted-foreground">
                                              Due: {formatDate(item.dueDate)}
                                            </span>
                                          )}
                                          <Badge
                                            variant={
                                              item.status === "COMPLETE"
                                                ? "default"
                                                : "outline"
                                            }
                                            className="text-[10px]"
                                          >
                                            {item.status}
                                          </Badge>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
