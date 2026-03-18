"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { DocumentUpload } from "@/components/documents/document-upload"
import { DocumentList } from "@/components/documents/document-list"
import { AIAnalysisPanel } from "@/components/cases/ai-analysis-panel"
import {
  ArrowLeft,
  Save,
  FileText,
  Brain,
  Clock,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  PenLine,
  RotateCcw,
  FolderPlus,
  Trash2,
} from "lucide-react"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS, FILING_STATUS_LABELS, TASK_TYPE_LABELS } from "@/types"

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years !== 1 ? "s" : ""} ago`
}

function formatTaskType(taskType: string): string {
  return TASK_TYPE_LABELS[taskType as keyof typeof TASK_TYPE_LABELS] || taskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const SPREADSHEET_TASK_TYPES = new Set(["WORKING_PAPERS", "OIC_NARRATIVE"])

const taskStatusStyles: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  READY_FOR_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
}

const reviewActionLabels: Record<string, string> = {
  APPROVE: "Approved",
  EDIT_APPROVE: "Edited & Approved",
  REJECT_REPROMPT: "Rejected (Re-prompt)",
  REJECT_MANUAL: "Rejected (Manual)",
}

const reviewActionColors: Record<string, string> = {
  APPROVE: "bg-green-500",
  EDIT_APPROVE: "bg-yellow-500",
  REJECT_REPROMPT: "bg-red-500",
  REJECT_MANUAL: "bg-red-500",
}

const reviewActionIcons: Record<string, typeof CheckCircle> = {
  APPROVE: CheckCircle,
  EDIT_APPROVE: PenLine,
  REJECT_REPROMPT: RotateCcw,
  REJECT_MANUAL: XCircle,
}

const statusColors: Record<string, string> = {
  INTAKE: "bg-blue-100 text-blue-800",
  ANALYSIS: "bg-yellow-100 text-yellow-800",
  REVIEW: "bg-purple-100 text-purple-800",
  ACTIVE: "bg-green-100 text-green-800",
  RESOLVED: "bg-gray-100 text-gray-800",
  CLOSED: "bg-gray-200 text-gray-600",
}

interface CaseDetailProps {
  caseData: any
  practitioners: { id: string; name: string }[]
}

export function CaseDetail({ caseData, practitioners }: CaseDetailProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    clientName: caseData.clientName,
    caseType: caseData.caseType,
    status: caseData.status,
    notes: caseData.notes || "",
    assignedPractitionerId: caseData.assignedPractitionerId || "",
    filingStatus: caseData.filingStatus || "",
    clientEmail: caseData.clientEmail || "",
    clientPhone: caseData.clientPhone || "",
    totalLiability: caseData.totalLiability != null ? String(caseData.totalLiability) : "",
  })
  const router = useRouter()
  const { addToast } = useToast()

  const approvedTasks = caseData.aiTasks.filter((t: any) => t.status === "APPROVED")
  const failedTasks = caseData.aiTasks.filter((t: any) => t.status === "PROCESSING" || t.status === "REJECTED")

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Delete this AI task? This cannot be undone.")) return
    const res = await fetch(`/api/ai/tasks/${taskId}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      addToast({ title: "Error", description: err.error || "Failed to delete", variant: "destructive" })
      return
    }
    addToast({ title: "Task deleted" })
    router.refresh()
  }

  async function handleCleanupTasks() {
    if (!confirm(`Delete ${failedTasks.length} failed/stuck tasks?`)) return
    const res = await fetch(`/api/cases/${caseData.id}/cleanup-tasks`, { method: "DELETE" })
    if (res.ok) {
      addToast({ title: "Cleaned up failed tasks" })
      router.refresh()
    }
  }

  async function handleDeleteCase() {
    if (!confirm(`Delete case ${caseData.caseNumber}? This permanently deletes all documents, AI tasks, and review history.`)) return
    const res = await fetch(`/api/cases/${caseData.id}`, { method: "DELETE" })
    if (res.ok) {
      addToast({ title: "Case deleted" })
      router.push("/cases")
    } else {
      addToast({ title: "Error", description: "Failed to delete case", variant: "destructive" })
    }
  }

  // Build timeline events from case data
  const timelineEvents = (() => {
    const events: {
      date: Date
      type: "case" | "document" | "ai" | "review"
      title: string
      description?: string
      action?: string
    }[] = []

    // Case created
    events.push({
      date: new Date(caseData.createdAt),
      type: "case",
      title: "Case created",
      description: caseData.caseNumber,
    })

    // Document uploads
    caseData.documents.forEach((doc: any) => {
      events.push({
        date: new Date(doc.uploadedAt),
        type: "document",
        title: `Document uploaded — ${doc.fileName}`,
        description: doc.uploadedBy?.name ? `by ${doc.uploadedBy.name}` : undefined,
      })
    })

    // AI tasks
    caseData.aiTasks.forEach((task: any) => {
      events.push({
        date: new Date(task.createdAt),
        type: "ai",
        title: `AI Analysis started — ${formatTaskType(task.taskType)}`,
      })

      // Review actions
      if (task.reviewActions) {
        task.reviewActions.forEach((ra: any) => {
          events.push({
            date: new Date(ra.reviewCompletedAt || ra.reviewStartedAt),
            type: "review",
            title: `${reviewActionLabels[ra.action] || ra.action} — ${formatTaskType(task.taskType)}`,
            description: ra.practitioner?.name ? `by ${ra.practitioner.name}` : undefined,
            action: ra.action,
          })
        })
      }
    })

    // Sort newest first
    events.sort((a, b) => b.date.getTime() - a.date.getTime())
    return events
  })()

  async function handleSave() {
    if (form.status === "CLOSED" && caseData.status !== "CLOSED") {
      if (!window.confirm("Are you sure you want to close this case? This action may be difficult to reverse.")) return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          filingStatus: form.filingStatus || undefined,
          clientEmail: form.clientEmail || undefined,
          clientPhone: form.clientPhone || undefined,
          totalLiability: form.totalLiability ? parseFloat(form.totalLiability) : undefined,
        }),
      })

      if (!res.ok) throw new Error("Failed to update")

      addToast({ title: "Case updated" })
      setEditing(false)
      router.refresh()
    } catch {
      addToast({ title: "Error", description: "Failed to update case", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/cases">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{caseData.caseNumber}</h1>
            <Badge className={statusColors[caseData.status] || ""} variant="secondary">
              {CASE_STATUS_LABELS[caseData.status as keyof typeof CASE_STATUS_LABELS]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{caseData.clientName}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>Edit Case</Button>
              <Button variant="outline" size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={handleDeleteCase}>
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="mr-1 h-4 w-4" />
            Documents ({caseData.documents.length})
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Brain className="mr-1 h-4 w-4" />
            AI Tasks ({caseData.aiTasks.length})
          </TabsTrigger>
          <TabsTrigger value="deliverables">
            <Download className="mr-1 h-4 w-4" />
            Deliverables ({approvedTasks.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="mr-1 h-4 w-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Case Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  {editing ? (
                    <Input
                      value={form.clientName}
                      onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm">{caseData.clientName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Case Type</Label>
                  {editing ? (
                    <Select value={form.caseType} onValueChange={(v) => setForm({ ...form, caseType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_TYPE_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{CASE_TYPE_LABELS[caseData.caseType as keyof typeof CASE_TYPE_LABELS]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  {editing ? (
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_STATUS_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={statusColors[caseData.status] || ""} variant="secondary">
                      {CASE_STATUS_LABELS[caseData.status as keyof typeof CASE_STATUS_LABELS]}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Filing Status</Label>
                  {editing ? (
                    <Select value={form.filingStatus} onValueChange={(v) => setForm({ ...form, filingStatus: v })}>
                      <SelectTrigger><SelectValue placeholder="Select filing status" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(FILING_STATUS_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{caseData.filingStatus ? FILING_STATUS_LABELS[caseData.filingStatus as keyof typeof FILING_STATUS_LABELS] : "Not set"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Client Email</Label>
                  {editing ? (
                    <Input
                      type="email"
                      value={form.clientEmail}
                      onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                      placeholder="client@example.com"
                    />
                  ) : (
                    <p className="text-sm">{caseData.clientEmail || "Not set"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Client Phone</Label>
                  {editing ? (
                    <Input
                      type="tel"
                      value={form.clientPhone}
                      onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  ) : (
                    <p className="text-sm">{caseData.clientPhone || "Not set"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Estimated Total Liability</Label>
                  {editing ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.totalLiability}
                      onChange={(e) => setForm({ ...form, totalLiability: e.target.value })}
                      placeholder="0.00"
                    />
                  ) : (
                    <p className="text-sm">
                      {caseData.totalLiability != null
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(caseData.totalLiability))
                        : "Not set"}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assignment & Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Assigned Practitioner</Label>
                  {editing ? (
                    <Select
                      value={form.assignedPractitionerId}
                      onValueChange={(v) => setForm({ ...form, assignedPractitionerId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select practitioner" /></SelectTrigger>
                      <SelectContent>
                        {practitioners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{caseData.assignedPractitioner?.name || "Unassigned"}</p>
                  )}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Notes</Label>
                  {editing ? (
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{caseData.notes || "No notes"}</p>
                  )}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p>{new Date(caseData.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p>{new Date(caseData.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Liability Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Liability Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {caseData.totalLiability != null ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Estimated Total Liability</span>
                    <span className="text-xl font-bold">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(caseData.totalLiability))}
                    </span>
                  </div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Detailed liability breakdown by tax year will appear here after transcript analysis.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No liability data yet. Set the estimated total liability above, or run an AI analysis after uploading IRS transcripts.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentUpload caseId={caseData.id} />
          <DocumentList documents={caseData.documents} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AIAnalysisPanel
            caseId={caseData.id}
            caseType={caseData.caseType}
            documentCount={caseData.documents.length}
            documentsWithTextCount={caseData.documents.filter((d: any) => d.extractedText && d.extractedText.trim().length > 0).length}
          />
          {failedTasks.length > 1 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCleanupTasks}
                className="text-destructive text-xs">
                <Trash2 className="mr-1 h-3 w-3" />
                Clear {failedTasks.length} failed tasks
              </Button>
            </div>
          )}
          {caseData.aiTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No AI tasks yet</h3>
                <p className="text-sm text-muted-foreground">
                  Upload documents and run AI analysis to generate working papers and memos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {caseData.aiTasks.map((task: any) => (
                <Card key={task.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="flex items-center justify-between p-4">
                    <Link href={`/review/${task.id}`} className="flex-1 min-w-0">
                      <p className="font-medium">{formatTaskType(task.taskType)}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(task.createdAt).toLocaleString()} &middot;{" "}
                        {task.modelUsed || (task.status === "REJECTED" ? "failed" : "starting...")}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={taskStatusStyles[task.status] || ""} variant="secondary">
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                      {task.status !== "APPROVED" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={(e) => { e.preventDefault(); handleDeleteTask(task.id) }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deliverables" className="space-y-4">
          {approvedTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Download className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No approved deliverables yet</h3>
                <p className="text-sm text-muted-foreground">
                  Approve AI outputs from the Review Queue to generate deliverables.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {approvedTasks.map((task: any) => {
                const approvalAction = task.reviewActions?.find(
                  (ra: any) => ra.action === "APPROVE" || ra.action === "EDIT_APPROVE"
                )
                const isSpreadsheet = SPREADSHEET_TASK_TYPES.has(task.taskType)
                return (
                  <Card key={task.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{formatTaskType(task.taskType)}</p>
                            <Badge className="bg-green-100 text-green-800" variant="secondary">
                              Final
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {approvalAction
                              ? `Approved ${timeAgo(approvalAction.reviewCompletedAt || approvalAction.reviewStartedAt)}${
                                  approvalAction.practitioner?.name
                                    ? ` by ${approvalAction.practitioner.name}`
                                    : ""
                                }`
                              : `Approved ${timeAgo(task.updatedAt || task.createdAt)}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.open(
                            `/api/ai/tasks/${task.id}/export?format=${isSpreadsheet ? "xlsx" : "docx"}`,
                            "_blank"
                          )
                        }}
                      >
                        <Download className="mr-1 h-4 w-4" />
                        Export {isSpreadsheet ? ".xlsx" : ".docx"}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          {timelineEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No activity yet</h3>
                <p className="text-sm text-muted-foreground">
                  Activity will appear here as you work on this case.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

                  <div className="space-y-6">
                    {timelineEvents.map((event, index) => {
                      let dotColor = "bg-blue-500"
                      let EventIcon = FolderPlus

                      if (event.type === "document") {
                        dotColor = "bg-green-500"
                        EventIcon = Upload
                      } else if (event.type === "ai") {
                        dotColor = "bg-purple-500"
                        EventIcon = Brain
                      } else if (event.type === "review") {
                        dotColor = reviewActionColors[event.action || ""] || "bg-yellow-500"
                        EventIcon = reviewActionIcons[event.action || ""] || CheckCircle
                      }

                      return (
                        <div key={index} className="relative flex gap-4 pl-8">
                          {/* Dot */}
                          <div
                            className={`absolute left-0 top-1 h-5 w-5 rounded-full ${dotColor} flex items-center justify-center`}
                          >
                            <EventIcon className="h-3 w-3 text-white" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{event.title}</p>
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {timeAgo(event.date)}
                              </p>
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
