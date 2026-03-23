"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { formatDate } from "@/lib/date-utils"
import { DocumentUpload } from "@/components/documents/document-upload"
import { DocumentList } from "@/components/documents/document-list"
import { BanjoPanel } from "@/components/banjo/banjo-panel"
import { BanjoIcon } from "@/components/banjo/banjo-icon"
import {
  ArrowLeft,
  Save,
  FileText,
  Clock,
  Download,
  CheckCircle,
  XCircle,
  PenLine,
  RotateCcw,
  Trash2,
  Calendar as CalendarIcon,
  Settings,
} from "lucide-react"
import { DeadlineCard } from "@/components/calendar/deadline-card"
import { AddDeadlineDialog } from "@/components/calendar/add-deadline-dialog"
import { CasePosturePanel } from "@/components/cases/case-posture-panel"
import { CaseJunebug } from "@/components/cases/case-junebug"
import { ActivityFeed } from "@/components/cases/activity-feed"
import { FeedPage } from "@/components/feed/feed-page"
import { DEADLINE_PRIORITY_DOTS } from "@/types"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS, FILING_STATUS_LABELS, TASK_TYPE_LABELS } from "@/types"

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatTaskType(taskType: string): string {
  return TASK_TYPE_LABELS[taskType as keyof typeof TASK_TYPE_LABELS] || taskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const SPREADSHEET_TASK_TYPES = new Set(["WORKING_PAPERS"])

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
  practitioners: { id: string; name: string; role?: string }[]
  deadlines?: any[]
  intelligence?: any | null
  activities?: any[]
  feedPosts?: any[]
  currentUser?: any
}

const WORKSPACES = ["documents", "banjo", "deliverables", "deadlines", "activity", "settings"] as const
type Workspace = typeof WORKSPACES[number]

export function CaseDetail({ caseData, practitioners, deadlines = [], intelligence = null, activities = [], feedPosts = [], currentUser }: CaseDetailProps) {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "")
      if ((WORKSPACES as readonly string[]).includes(hash)) return hash as Workspace
      // Backwards compat
      if (hash === "overview" || hash === "ai") return "documents"
    }
    return "documents"
  })
  const [junebugCollapsed, setJunebugCollapsed] = useState(true)

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "")
      if ((WORKSPACES as readonly string[]).includes(hash)) setWorkspace(hash as Workspace)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  function handleWorkspaceChange(w: Workspace) {
    setWorkspace(w)
    window.history.replaceState(null, "", `#${w}`)
  }

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    clientName: caseData.clientName,
    tabsNumber: caseData.tabsNumber || "",
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
      addToast({ title: "Error", description: "Failed to delete", variant: "destructive" })
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
    if (!confirm(`Delete case ${caseData.tabsNumber || caseData.id}? This permanently deletes all documents, AI tasks, and review history.`)) return
    const res = await fetch(`/api/cases/${caseData.id}`, { method: "DELETE" })
    if (res.ok) {
      addToast({ title: "Case deleted" })
      router.push("/cases")
    } else {
      addToast({ title: "Error", description: "Failed to delete case", variant: "destructive" })
    }
  }

  async function handleSave() {
    if (form.status === "CLOSED" && caseData.status !== "CLOSED") {
      if (!window.confirm("Are you sure you want to close this case?")) return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tabsNumber: form.tabsNumber || undefined,
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

  const caseContext = {
    caseId: caseData.id,
    tabsNumber: caseData.tabsNumber || caseData.id,
    caseType: caseData.caseType,
    status: caseData.status,
    filingStatus: caseData.filingStatus,
    totalLiability: caseData.totalLiability ? Number(caseData.totalLiability) : undefined,
  }

  // Workspace tab button
  function WorkspaceTab({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        {children}
        {count != null && count > 0 && (
          <span className={`ml-1 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            ({count})
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Link href="/cases">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{caseData.tabsNumber || "No TABS #"}</h1>
            <span className="text-sm text-muted-foreground truncate">{caseData.clientName}</span>
            <Badge className={`${statusColors[caseData.status] || ""} shrink-0`} variant="secondary">
              {CASE_STATUS_LABELS[caseData.status as keyof typeof CASE_STATUS_LABELS]}
            </Badge>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {CASE_TYPE_LABELS[caseData.caseType as keyof typeof CASE_TYPE_LABELS] || caseData.caseType}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => handleWorkspaceChange("settings")}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Split pane: left rail + workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Rail — Case Posture */}
        <aside className="w-[280px] lg:w-[300px] border-r overflow-y-auto p-4 shrink-0 hidden md:block">
          <CasePosturePanel intelligence={intelligence} caseData={caseData} deadlines={deadlines} />
        </aside>

        {/* Right — Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Workspace switcher */}
          <div className="flex items-center gap-1 border-b px-4 py-2 shrink-0 overflow-x-auto">
            <WorkspaceTab active={workspace === "documents"} onClick={() => handleWorkspaceChange("documents")} count={caseData.documents.length}>
              Documents
            </WorkspaceTab>
            <WorkspaceTab active={workspace === "banjo"} onClick={() => handleWorkspaceChange("banjo")}>
              Banjo
            </WorkspaceTab>
            <WorkspaceTab active={workspace === "deliverables"} onClick={() => handleWorkspaceChange("deliverables")} count={approvedTasks.length}>
              Deliverables
            </WorkspaceTab>
            <WorkspaceTab active={workspace === "deadlines"} onClick={() => handleWorkspaceChange("deadlines")} count={deadlines.length}>
              Deadlines
            </WorkspaceTab>
            <WorkspaceTab active={workspace === "activity"} onClick={() => handleWorkspaceChange("activity")}>
              Activity
            </WorkspaceTab>
          </div>

          {/* Workspace content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── Documents ── */}
            {workspace === "documents" && (
              <>
                <DocumentUpload caseId={caseData.id} />
                <DocumentList documents={caseData.documents} />
              </>
            )}

            {/* ── Banjo ── */}
            {workspace === "banjo" && (
              <>
                <BanjoPanel
                  caseId={caseData.id}
                  caseType={caseData.caseType}
                  caseData={{
                    caseNumber: caseData.tabsNumber || caseData.id,
                    clientName: caseData.clientName,
                    filingStatus: caseData.filingStatus,
                    status: caseData.status,
                  }}
                  documentCount={caseData.documents.length}
                  documentsWithTextCount={caseData.documents.filter((d: any) => d.extractedText?.trim().length > 0).length}
                  existingTasks={caseData.aiTasks.map((t: any) => ({
                    id: t.id,
                    taskType: t.taskType,
                    status: t.status,
                    createdAt: t.createdAt,
                    banjoAssignmentId: t.banjoAssignmentId || null,
                    banjoStepLabel: t.banjoStepLabel || null,
                  }))}
                />
                {failedTasks.length > 1 && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={handleCleanupTasks} className="text-destructive text-xs">
                      <Trash2 className="mr-1 h-3 w-3" />
                      Clear {failedTasks.length} failed tasks
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* ── Deliverables ── */}
            {workspace === "deliverables" && (
              <>
                {approvedTasks.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Download className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 text-lg font-semibold">No approved deliverables yet</h3>
                      <p className="text-sm text-muted-foreground">Approve AI outputs from the Review Queue.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const bundles = new Map<string, any[]>()
                      const standalone: any[] = []
                      for (const task of approvedTasks) {
                        if (task.banjoAssignmentId) {
                          const existing = bundles.get(task.banjoAssignmentId) || []
                          existing.push(task)
                          bundles.set(task.banjoAssignmentId, existing)
                        } else {
                          standalone.push(task)
                        }
                      }
                      return (
                        <>
                          {Array.from(bundles.entries()).map(([assignmentId, tasks]) => (
                            <Card key={assignmentId}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <BanjoIcon className="h-4 w-4" />
                                    <p className="font-medium text-sm">Banjo &mdash; {new Date(tasks[0].createdAt).toLocaleDateString()}</p>
                                  </div>
                                  <Button variant="outline" size="sm" onClick={() => window.open(`/api/banjo/${assignmentId}/export-zip`, "_blank")}>
                                    <Download className="mr-1 h-3.5 w-3.5" /> ZIP
                                  </Button>
                                </div>
                                {tasks.sort((a: any, b: any) => (a.banjoStepNumber || 0) - (b.banjoStepNumber || 0)).map((task: any) => {
                                  const isSS = SPREADSHEET_TASK_TYPES.has(task.taskType)
                                  return (
                                    <div key={task.id} className="flex items-center justify-between pl-6">
                                      <div className="flex items-center gap-2">
                                        <Badge className="bg-green-100 text-green-800 text-[10px]" variant="secondary">Approved</Badge>
                                        <p className="text-sm">{task.banjoStepLabel || formatTaskType(task.taskType)}</p>
                                      </div>
                                      <Button variant="ghost" size="sm" onClick={() => window.open(`/api/ai/tasks/${task.id}/export?format=${isSS ? "xlsx" : "docx"}`, "_blank")}>
                                        <Download className="mr-1 h-3 w-3" /> {isSS ? ".xlsx" : ".docx"}
                                      </Button>
                                    </div>
                                  )
                                })}
                              </CardContent>
                            </Card>
                          ))}
                          {standalone.map((task: any) => {
                            const isSS = SPREADSHEET_TASK_TYPES.has(task.taskType)
                            return (
                              <Card key={task.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                  <div>
                                    <p className="font-medium">{formatTaskType(task.taskType)}</p>
                                    <p className="text-xs text-muted-foreground">Approved {timeAgo(task.updatedAt || task.createdAt)}</p>
                                  </div>
                                  <Button variant="outline" size="sm" onClick={() => window.open(`/api/ai/tasks/${task.id}/export?format=${isSS ? "xlsx" : "docx"}`, "_blank")}>
                                    <Download className="mr-1 h-3.5 w-3.5" /> {isSS ? ".xlsx" : ".docx"}
                                  </Button>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </>
                      )
                    })()}
                  </div>
                )}
              </>
            )}

            {/* ── Deadlines ── */}
            {workspace === "deadlines" && (
              <>
                <div className="flex justify-end">
                  <AddDeadlineDialog
                    cases={[{ id: caseData.id, tabsNumber: caseData.tabsNumber || caseData.id, clientName: caseData.clientName }]}
                    users={practitioners.map(p => ({ ...p, role: p.role || "PRACTITIONER" }))}
                    preselectedCaseId={caseData.id}
                  />
                </div>
                {deadlines.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CalendarIcon className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 text-lg font-semibold">No deadlines</h3>
                      <p className="text-sm text-muted-foreground">Add deadlines to track important dates.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {deadlines.filter((d: any) => d.status !== "COMPLETED").map((d: any) => (
                      <DeadlineCard key={d.id} deadline={d} users={practitioners.map(p => ({ ...p, role: p.role || "PRACTITIONER" }))} />
                    ))}
                    {deadlines.filter((d: any) => d.status === "COMPLETED").length > 0 && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                          Completed ({deadlines.filter((d: any) => d.status === "COMPLETED").length})
                        </summary>
                        <div className="space-y-2 mt-2">
                          {deadlines.filter((d: any) => d.status === "COMPLETED").map((d: any) => (
                            <DeadlineCard key={d.id} deadline={d} users={practitioners.map(p => ({ ...p, role: p.role || "PRACTITIONER" }))} />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Activity (Case-Scoped Feed) ── */}
            {workspace === "activity" && (
              currentUser && feedPosts ? (
                <FeedPage
                  currentUser={currentUser}
                  initialPosts={feedPosts}
                  caseId={caseData.id}
                  cases={[{ id: caseData.id, tabsNumber: caseData.tabsNumber || caseData.id, clientName: caseData.clientName }]}
                  users={practitioners.map(p => ({ id: p.id, name: p.name }))}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" /> Activity Feed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ActivityFeed activities={activities} />
                  </CardContent>
                </Card>
              )
            )}

            {/* ── Settings (Case editing) ── */}
            {workspace === "settings" && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Case Settings</h2>
                  <div className="flex gap-2">
                    {editing ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                          <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    )}
                  </div>
                </div>
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {[
                      { label: "Client Name", key: "clientName", type: "text" },
                      { label: "TABS Number", key: "tabsNumber", type: "text", placeholder: "e.g. 12345.001" },
                      { label: "Client Email", key: "clientEmail", type: "email" },
                      { label: "Client Phone", key: "clientPhone", type: "tel" },
                      { label: "Total Liability", key: "totalLiability", type: "number" },
                    ].map(({ label, key, type, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        {editing ? (
                          <Input
                            type={type}
                            value={(form as any)[key]}
                            onChange={e => setForm({ ...form, [key]: e.target.value })}
                            placeholder={placeholder}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <p className="text-sm">{(caseData as any)[key] || <span className="text-muted-foreground">Not set</span>}</p>
                        )}
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label className="text-xs">Case Type</Label>
                      {editing ? (
                        <Select value={form.caseType} onValueChange={v => setForm({ ...form, caseType: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      {editing ? (
                        <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
                    <div className="space-y-1">
                      <Label className="text-xs">Filing Status</Label>
                      {editing ? (
                        <Select value={form.filingStatus} onValueChange={v => setForm({ ...form, filingStatus: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
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
                    <div className="space-y-1">
                      <Label className="text-xs">Assigned Practitioner</Label>
                      {editing ? (
                        <Select value={form.assignedPractitionerId} onValueChange={v => setForm({ ...form, assignedPractitionerId: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {practitioners.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{caseData.assignedPractitioner?.name || "Unassigned"}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      {editing ? (
                        <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="text-sm" />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{caseData.notes || "No notes"}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Separator />
                <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={handleDeleteCase}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete Case
                </Button>
              </div>
            )}
          </div>

          {/* Inline Junebug */}
          <CaseJunebug
            caseId={caseData.id}
            caseContext={caseContext}
            collapsed={junebugCollapsed}
            onToggle={() => setJunebugCollapsed(!junebugCollapsed)}
            digest={intelligence?.digest}
          />
        </div>
      </div>
    </div>
  )
}
