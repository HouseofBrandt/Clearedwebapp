"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
} from "lucide-react"
import Link from "next/link"
import { TASK_TYPE_LABELS } from "@/types"

const CASE_TYPES = [
  "OIC", "IA", "PENALTY", "INNOCENT_SPOUSE", "CNC", "TFRP",
  "ERC", "UNFILED", "AUDIT", "CDP", "AMENDED", "VOLUNTARY_DISCLOSURE", "OTHER",
] as const

const TASK_TYPES = [
  "WORKING_PAPERS", "CASE_MEMO", "PENALTY_LETTER", "OIC_NARRATIVE",
  "GENERAL_ANALYSIS", "IA_ANALYSIS", "CNC_ANALYSIS", "TFRP_ANALYSIS",
  "INNOCENT_SPOUSE_ANALYSIS", "APPEALS_REBUTTAL", "CASE_SUMMARY", "RISK_ASSESSMENT", "WEB_RESEARCH",
] as const

interface PendingTask {
  id: string
  taskType: string
  createdAt: string
  verifyFlagCount: number
  judgmentFlagCount: number
  banjoAssignmentId?: string | null
  banjoStepNumber?: number | null
  banjoStepLabel?: string | null
  case: {
    id: string
    tabsNumber: string
    clientName: string
    caseType: string
    assignedPractitionerId?: string | null
  }
}

interface Practitioner {
  id: string
  name: string
  role?: string
  licenseType?: string | null
}

interface AssigneeOption {
  id: string
  name: string
}

interface ReviewQueueProps {
  tasks: PendingTask[]
  userRole?: string
  currentUserId?: string
  practitioners?: AssigneeOption[]
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)

  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  if (diffHr > 0) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`
  if (diffMin > 0) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`
  return "just now"
}

function isOlderThan48Hours(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() > 48 * 60 * 60 * 1000
}

interface BanjoBundle {
  assignmentId: string
  tasks: PendingTask[]
  caseInfo: PendingTask["case"]
  earliestDate: string
}

function BanjoBundleCard({
  bundle,
  selectedIds,
  onToggleTask,
  canBulkOperate,
}: {
  bundle: BanjoBundle
  selectedIds: Set<string>
  onToggleTask: (id: string) => void
  canBulkOperate: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const totalVerify = bundle.tasks.reduce((sum, t) => sum + t.verifyFlagCount, 0)
  const totalJudgment = bundle.tasks.reduce((sum, t) => sum + t.judgmentFlagCount, 0)
  const allBundleSelected = bundle.tasks.every((t) => selectedIds.has(t.id))
  const someBundleSelected = bundle.tasks.some((t) => selectedIds.has(t.id))

  const handleBundleToggle = () => {
    if (allBundleSelected) {
      bundle.tasks.forEach((t) => onToggleTask(t.id))
    } else {
      bundle.tasks.forEach((t) => {
        if (!selectedIds.has(t.id)) onToggleTask(t.id)
      })
    }
  }

  return (
    <Card className={`transition-all duration-200 hover:border-[var(--c-gray-200)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] ${isOlderThan48Hours(bundle.earliestDate) ? "border-l-4 border-l-yellow-400" : ""}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          {canBulkOperate && (
            <Checkbox
              checked={allBundleSelected ? true : someBundleSelected ? "indeterminate" : false}
              onCheckedChange={handleBundleToggle}
              aria-label={`Select all tasks in bundle ${bundle.caseInfo.tabsNumber}`}
            />
          )}
          <button type="button" onClick={() => setExpanded(!expanded)} className="shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm">&#x1FA95;</span>
              <p className="font-medium">Banjo Assignment &mdash; {bundle.caseInfo.tabsNumber}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {bundle.tasks.length} deliverable{bundle.tasks.length !== 1 ? "s" : ""} &middot; {bundle.caseInfo.clientName}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalVerify > 0 && (
              <Badge variant="outline" className="gap-1 text-yellow-600">
                <AlertTriangle className="h-3 w-3" />
                {totalVerify} VERIFY
              </Badge>
            )}
            {totalJudgment > 0 && (
              <Badge variant="outline" className="gap-1 text-blue-600">
                <FileText className="h-3 w-3" />
                {totalJudgment} JUDGMENT
              </Badge>
            )}
            <Badge variant="secondary">{bundle.caseInfo.caseType.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-muted-foreground">{relativeTime(bundle.earliestDate)}</span>
          </div>
        </div>

        {expanded && (
          <div className="pl-8 space-y-1">
            {bundle.tasks
              .sort((a, b) => (a.banjoStepNumber || 0) - (b.banjoStepNumber || 0))
              .map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  {canBulkOperate && (
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onCheckedChange={() => onToggleTask(task.id)}
                      aria-label={`Select task ${task.banjoStepLabel || task.taskType}`}
                    />
                  )}
                  <Link
                    href={`/review/${task.id}`}
                    className="flex-1 flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{task.banjoStepNumber}.</span>
                      <span className="text-sm">
                        {task.banjoStepLabel || TASK_TYPE_LABELS[task.taskType as keyof typeof TASK_TYPE_LABELS] || task.taskType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.verifyFlagCount > 0 && (
                        <span className="text-xs text-yellow-600">{task.verifyFlagCount} verify</span>
                      )}
                      <Button size="sm" variant="outline">Review</Button>
                    </div>
                  </Link>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReviewQueue({ tasks, userRole, currentUserId, practitioners: assigneeOptions }: ReviewQueueProps) {
  const router = useRouter()
  const [assigneeFilter, setAssigneeFilter] = useState<string>(currentUserId || "ALL")
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("ALL")
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("ALL")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // Reassign dialog state
  const [reassignOpen, setReassignOpen] = useState(false)
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [practitionersLoading, setPractitionersLoading] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<string>("")
  const [reassignLoading, setReassignLoading] = useState(false)

  const canBulkOperate = userRole === "ADMIN" || userRole === "SENIOR"

  const filteredTasks = useMemo(() => {
    let result = tasks

    if (assigneeFilter !== "ALL") {
      result = result.filter((t) => t.createdById === assigneeFilter || t.case.assignedPractitionerId === assigneeFilter)
    }
    if (caseTypeFilter !== "ALL") {
      result = result.filter((t) => t.case.caseType === caseTypeFilter)
    }
    if (taskTypeFilter !== "ALL") {
      result = result.filter((t) => t.taskType === taskTypeFilter)
    }

    result = [...result].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime
    })

    return result
  }, [tasks, assigneeFilter, caseTypeFilter, taskTypeFilter, sortOrder])

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [assigneeFilter, caseTypeFilter, taskTypeFilter])

  // All filtered task IDs for "select all"
  const allFilteredIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks])
  const allSelected = allFilteredIds.size > 0 && Array.from(allFilteredIds).every((id) => selectedIds.has(id))
  const someSelected = selectedIds.size > 0

  // Group tasks by banjoAssignmentId
  const { bundles, standaloneTasks } = useMemo(() => {
    const bundleMap = new Map<string, BanjoBundle>()
    const standalone: PendingTask[] = []

    for (const task of filteredTasks) {
      if (task.banjoAssignmentId) {
        const existing = bundleMap.get(task.banjoAssignmentId)
        if (existing) {
          existing.tasks.push(task)
          if (task.createdAt < existing.earliestDate) {
            existing.earliestDate = task.createdAt
          }
        } else {
          bundleMap.set(task.banjoAssignmentId, {
            assignmentId: task.banjoAssignmentId,
            tasks: [task],
            caseInfo: task.case,
            earliestDate: task.createdAt,
          })
        }
      } else {
        standalone.push(task)
      }
    }

    return { bundles: Array.from(bundleMap.values()), standaloneTasks: standalone }
  }, [filteredTasks])

  const toggleTask = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allFilteredIds))
    }
  }, [allSelected, allFilteredIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBulkAction = useCallback(
    async (action: "APPROVE" | "REJECT_MANUAL") => {
      if (selectedIds.size === 0) return
      setBulkLoading(true)
      setBulkError(null)

      try {
        const res = await fetch("/api/review/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskIds: Array.from(selectedIds),
            action,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Bulk action failed")
        }

        setSelectedIds(new Set())
        router.refresh()
      } catch (err: any) {
        setBulkError(err.message)
      } finally {
        setBulkLoading(false)
      }
    },
    [selectedIds, router]
  )

  const openReassignDialog = useCallback(async () => {
    setReassignOpen(true)
    setSelectedPractitioner("")
    setPractitionersLoading(true)

    try {
      const res = await fetch("/api/review/practitioners")
      if (!res.ok) throw new Error("Failed to load practitioners")
      const data = await res.json()
      setPractitioners(data)
    } catch {
      setPractitioners([])
    } finally {
      setPractitionersLoading(false)
    }
  }, [])

  const handleReassign = useCallback(async () => {
    if (!selectedPractitioner || selectedIds.size === 0) return
    setReassignLoading(true)

    try {
      const res = await fetch("/api/review/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: Array.from(selectedIds),
          newAssigneeId: selectedPractitioner,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Reassignment failed")
      }

      setReassignOpen(false)
      setSelectedIds(new Set())
      router.refresh()
    } catch (err: any) {
      setBulkError(err.message)
    } finally {
      setReassignLoading(false)
    }
  }, [selectedPractitioner, selectedIds, router])

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h3 className="mt-4 text-lg font-medium">All caught up &mdash; no pending reviews</h3>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and sorting */}
      <div className="flex flex-wrap items-center gap-3">
        {canBulkOperate && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all tasks"
            />
            <span className="text-sm text-muted-foreground">All</span>
          </div>
        )}

        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Assigned to" />
          </SelectTrigger>
          <SelectContent>
            {currentUserId && (
              <SelectItem value={currentUserId}>Me</SelectItem>
            )}
            {(assigneeOptions || [])
              .filter((p) => p.id !== currentUserId)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={caseTypeFilter} onValueChange={setCaseTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Case Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Case Types</SelectItem>
            {CASE_TYPES.map((ct) => (
              <SelectItem key={ct} value={ct}>
                {ct.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Task Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Task Types</SelectItem>
            {TASK_TYPES.map((tt) => (
              <SelectItem key={tt} value={tt}>
                {tt.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Bulk error banner */}
      {bulkError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{bulkError}</span>
          <button type="button" onClick={() => setBulkError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              No tasks match the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Banjo bundles */}
          {bundles.map((bundle) => (
            <BanjoBundleCard
              key={bundle.assignmentId}
              bundle={bundle}
              selectedIds={selectedIds}
              onToggleTask={toggleTask}
              canBulkOperate={canBulkOperate}
            />
          ))}

          {/* Standalone tasks */}
          {standaloneTasks.map((task) => (
            <Card
              key={task.id}
              className={`transition-all duration-200 hover:border-[var(--c-gray-200)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] ${
                isOlderThan48Hours(task.createdAt)
                  ? "border-l-4 border-l-yellow-400"
                  : ""
              }`}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  {canBulkOperate && (
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onCheckedChange={() => toggleTask(task.id)}
                      aria-label={`Select task ${task.taskType}`}
                    />
                  )}
                  <Brain className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{TASK_TYPE_LABELS[task.taskType as keyof typeof TASK_TYPE_LABELS] || task.taskType}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.case.tabsNumber} &middot; {task.case.clientName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {task.verifyFlagCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-yellow-600">
                      <AlertTriangle className="h-3 w-3" />
                      {task.verifyFlagCount} VERIFY
                    </Badge>
                  )}
                  {task.judgmentFlagCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-blue-600">
                      <FileText className="h-3 w-3" />
                      {task.judgmentFlagCount} JUDGMENT
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {task.case.caseType.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(task.createdAt)}
                  </span>
                  <Link href={`/review/${task.id}`}>
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sticky bulk action bar */}
      {canBulkOperate && someSelected && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                disabled={bulkLoading}
                onClick={() => handleBulkAction("APPROVE")}
              >
                {bulkLoading ? "Processing..." : "Bulk Approve"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkLoading}
                onClick={() => handleBulkAction("REJECT_MANUAL")}
              >
                {bulkLoading ? "Processing..." : "Bulk Reject"}
              </Button>
              <Button
                size="sm"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={bulkLoading}
                onClick={openReassignDialog}
              >
                <UserPlus className="mr-1 h-4 w-4" />
                Reassign
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={bulkLoading}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add bottom padding when the bulk bar is visible so content isn't hidden */}
      {canBulkOperate && someSelected && <div className="h-16" />}

      {/* Reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign {selectedIds.size} Review{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Select a practitioner to reassign the selected review tasks to.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {practitionersLoading ? (
              <p className="text-sm text-muted-foreground">Loading practitioners...</p>
            ) : practitioners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No practitioners found.</p>
            ) : (
              <Select value={selectedPractitioner} onValueChange={setSelectedPractitioner}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a practitioner" />
                </SelectTrigger>
                <SelectContent>
                  {practitioners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.role}{p.licenseType ? ` - ${p.licenseType}` : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignOpen(false)} disabled={reassignLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!selectedPractitioner || reassignLoading}
            >
              {reassignLoading ? "Reassigning..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
