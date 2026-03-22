"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Plus, Loader2 } from "lucide-react"
import {
  DEADLINE_TYPE_LABELS,
  DEADLINE_DEFAULT_PRIORITY,
  DEADLINE_DEFAULT_TITLES,
  ROLE_LABELS,
} from "@/types"

interface AddDeadlineDialogProps {
  cases: { id: string; tabsNumber: string; clientName: string }[]
  users: { id: string; name: string; role: string }[]
  preselectedCaseId?: string
  trigger?: React.ReactNode
}

export function AddDeadlineDialog({ cases, users, preselectedCaseId, trigger }: AddDeadlineDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [caseId, setCaseId] = useState(preselectedCaseId || "")
  const [type, setType] = useState("")
  const [title, setTitle] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [priority, setPriority] = useState("")
  const [assignedToId, setAssignedToId] = useState("")
  const [taxYear, setTaxYear] = useState("")
  const [irsNoticeDate, setIrsNoticeDate] = useState("")
  const [irsNoticeNumber, setIrsNoticeNumber] = useState("")
  const [description, setDescription] = useState("")
  const router = useRouter()
  const { addToast } = useToast()

  // Smart defaults when type changes
  useEffect(() => {
    if (!type) return
    const defaultTitle = DEADLINE_DEFAULT_TITLES[type]
    if (defaultTitle) setTitle(defaultTitle)

    const defaultPriority = DEADLINE_DEFAULT_PRIORITY[type]
    if (defaultPriority) setPriority(defaultPriority)

    // Date defaults
    const now = new Date()
    if (type === "RETURN_DUE" && !dueDate) {
      setDueDate(`${now.getFullYear()}-04-15`)
    } else if (type === "DOCUMENT_REQUEST" && !dueDate) {
      const d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      setDueDate(d.toISOString().split("T")[0])
    } else if (type === "FOLLOW_UP" && !dueDate) {
      const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      setDueDate(d.toISOString().split("T")[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  // CDP/Tax Court: auto-compute due date from IRS notice date
  useEffect(() => {
    if (!irsNoticeDate) return
    const noticeDate = new Date(irsNoticeDate)
    if (type === "CDP_HEARING") {
      const due = new Date(noticeDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      setDueDate(due.toISOString().split("T")[0])
    } else if (type === "TAX_COURT_PETITION") {
      const due = new Date(noticeDate.getTime() + 90 * 24 * 60 * 60 * 1000)
      setDueDate(due.toISOString().split("T")[0])
    }
  }, [irsNoticeDate, type])

  function resetForm() {
    if (!preselectedCaseId) setCaseId("")
    setType("")
    setTitle("")
    setDueDate("")
    setPriority("")
    setAssignedToId("")
    setTaxYear("")
    setIrsNoticeDate("")
    setIrsNoticeNumber("")
    setDescription("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!caseId || !type || !title || !dueDate) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          type,
          title,
          dueDate,
          priority: priority || undefined,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId || undefined,
          taxYear: taxYear ? parseInt(taxYear) : undefined,
          irsNoticeDate: irsNoticeDate || undefined,
          irsNoticeNumber: irsNoticeNumber || undefined,
          description: description || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to create deadline")
      }
      addToast({ title: "Deadline created" })
      resetForm()
      setOpen(false)
      router.refresh()
    } catch (error: any) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Add Deadline
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Deadline</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Case *</Label>
            <Select value={caseId} onValueChange={setCaseId} disabled={!!preselectedCaseId}>
              <SelectTrigger><SelectValue placeholder="Select case" /></SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.tabsNumber} — {c.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {Object.entries(DEADLINE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deadline title" />
          </div>

          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue placeholder="Auto from type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tax Year</Label>
              <Input type="number" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} placeholder="2024" />
            </div>
            <div className="space-y-2">
              <Label>IRS Notice #</Label>
              <Input value={irsNoticeNumber} onChange={(e) => setIrsNoticeNumber(e.target.value)} placeholder="LT11, CP14..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>IRS Notice Date</Label>
            <Input type="date" value={irsNoticeDate} onChange={(e) => setIrsNoticeDate(e.target.value)} />
            {(type === "CDP_HEARING" || type === "TAX_COURT_PETITION") && irsNoticeDate && (
              <p className="text-xs text-muted-foreground">
                Due date auto-calculated: {type === "CDP_HEARING" ? "30" : "90"} days from notice
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !caseId || !type || !title || !dueDate}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Create Deadline
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
