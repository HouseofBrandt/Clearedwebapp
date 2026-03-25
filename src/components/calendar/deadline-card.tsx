"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/date-utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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
import { useToast } from "@/components/ui/toast"
import { Check, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react"
import {
  DEADLINE_TYPE_LABELS,
  DEADLINE_PRIORITY_COLORS,
  DEADLINE_PRIORITY_DOTS,
  CASE_TYPE_LABELS,
  ROLE_LABELS,
} from "@/types"

interface DeadlineCardProps {
  deadline: any
  users: { id: string; name: string; role: string }[]
  compact?: boolean
}

function formatRelativeDate(dueDate: string | Date): string {
  const now = new Date()
  const due = new Date(dueDate)
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`
  if (diffDays === -1) return "1 day overdue"
  if (diffDays === 0) return "Due today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays <= 7) return `In ${diffDays} days`
  if (diffDays <= 30) return `In ${Math.ceil(diffDays / 7)} weeks`
  return `In ${Math.ceil(diffDays / 30)} months`
}


function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

export function DeadlineCard({ deadline, users, compact }: DeadlineCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [editTitle, setEditTitle] = useState(deadline.title)
  const [editDueDate, setEditDueDate] = useState(new Date(deadline.dueDate).toISOString().split("T")[0])
  const [editPriority, setEditPriority] = useState(deadline.priority)
  const [editAssignedToId, setEditAssignedToId] = useState(deadline.assignedToId || "unassigned")
  const [editDescription, setEditDescription] = useState(deadline.description || "")
  const [editType, setEditType] = useState(deadline.type)
  const [editTaxYear, setEditTaxYear] = useState(deadline.taxYear?.toString() || "")
  const router = useRouter()
  const { addToast } = useToast()

  const computedStatus = deadline.computedStatus || deadline.status
  const isOverdue = computedStatus === "OVERDUE"
  const isDueSoon = computedStatus === "DUE_SOON"
  const isCompleted = deadline.status === "COMPLETED"
  const priorityDot = DEADLINE_PRIORITY_DOTS[deadline.priority] || "bg-gray-400"
  const priorityBadge = DEADLINE_PRIORITY_COLORS[deadline.priority] || ""

  async function handleComplete() {
    setCompleting(true)
    try {
      const res = await fetch(`/api/deadlines/${deadline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      })
      if (!res.ok) throw new Error("Failed")
      addToast({ title: "Deadline completed" })
      router.refresh()
    } catch {
      addToast({ title: "Error", variant: "destructive" })
    } finally {
      setCompleting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/deadlines/${deadline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          dueDate: editDueDate,
          priority: editPriority,
          assignedToId: editAssignedToId === "unassigned" ? null : editAssignedToId,
          description: editDescription || null,
          type: editType,
          taxYear: editTaxYear ? parseInt(editTaxYear) : null,
        }),
      })
      if (!res.ok) throw new Error("Failed")
      addToast({ title: "Deadline updated" })
      setExpanded(false)
      router.refresh()
    } catch {
      addToast({ title: "Error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this deadline?")) return
    const res = await fetch(`/api/deadlines/${deadline.id}`, { method: "DELETE" })
    if (res.ok) {
      addToast({ title: "Deadline deleted" })
      router.refresh()
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${priorityDot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{deadline.title}</p>
          <Link href={`/cases/${deadline.case?.id || deadline.caseId}`} className="text-xs text-muted-foreground hover:underline">
            {deadline.case?.tabsNumber}
          </Link>
        </div>
        {deadline.assignedTo && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium shrink-0" title={deadline.assignedTo.name}>
            {getInitials(deadline.assignedTo.name)}
          </div>
        )}
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{formatDate(deadline.dueDate, { month: "short", day: "numeric", year: "numeric" })}</p>
          <p className={`text-xs font-medium ${isOverdue ? "text-red-600" : isDueSoon ? "text-amber-600" : "text-muted-foreground"}`}>
            {formatRelativeDate(deadline.dueDate)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border p-4 transition-colors ${isOverdue ? "border-red-200 bg-red-50/50" : isDueSoon ? "border-amber-200 bg-amber-50/30" : isCompleted ? "bg-muted/30 opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        {!isCompleted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 mt-0.5 rounded-full border hover:bg-green-50 hover:border-green-400"
            onClick={handleComplete}
            disabled={completing}
            title="Mark complete"
          >
            {completing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
        )}
        {isCompleted && (
          <div className="h-6 w-6 shrink-0 mt-0.5 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-3 w-3 text-green-600" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{deadline.title}</p>
              <Link href={`/cases/${deadline.case?.id || deadline.caseId}`} className="text-sm text-muted-foreground hover:underline">
                {deadline.case?.tabsNumber} · {deadline.case?.clientName}
                {deadline.case?.caseType && ` (${CASE_TYPE_LABELS[deadline.case.caseType as keyof typeof CASE_TYPE_LABELS] || deadline.case.caseType})`}
              </Link>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm">{formatDate(deadline.dueDate, { month: "short", day: "numeric", year: "numeric" })}</p>
              {isOverdue && <p className="text-xs font-medium text-red-600">OVERDUE</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-xs font-medium ${isOverdue ? "text-red-600" : isDueSoon ? "text-amber-600" : "text-muted-foreground"}`}>
              {isOverdue ? "!" : ""} {formatRelativeDate(deadline.dueDate)}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityBadge}`}>
              {deadline.priority}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {DEADLINE_TYPE_LABELS[deadline.type] || deadline.type}
            </Badge>
            {deadline.assignedTo ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-medium">
                  {getInitials(deadline.assignedTo.name)}
                </span>
                {deadline.assignedTo.name}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">Unassigned</span>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DEADLINE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assigned To</Label>
              <Select value={editAssignedToId} onValueChange={setEditAssignedToId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tax Year</Label>
              <Input type="number" value={editTaxYear} onChange={(e) => setEditTaxYear(e.target.value)} className="h-8 text-sm" placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className="text-sm" />
          </div>
          <div className="flex justify-between">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
