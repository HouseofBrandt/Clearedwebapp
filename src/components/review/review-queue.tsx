"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Brain, CheckCircle2, AlertTriangle, FileText, ChevronDown, ChevronRight } from "lucide-react"
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
  }
}

interface ReviewQueueProps {
  tasks: PendingTask[]
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

function BanjoBundleCard({ bundle }: { bundle: BanjoBundle }) {
  const [expanded, setExpanded] = useState(true)
  const totalVerify = bundle.tasks.reduce((sum, t) => sum + t.verifyFlagCount, 0)
  const totalJudgment = bundle.tasks.reduce((sum, t) => sum + t.judgmentFlagCount, 0)

  return (
    <Card className={isOlderThan48Hours(bundle.earliestDate) ? "border-l-4 border-l-yellow-400" : ""}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-3">
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
                <Link
                  key={task.id}
                  href={`/review/${task.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
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
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReviewQueue({ tasks }: ReviewQueueProps) {
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("ALL")
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("ALL")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")

  const filteredTasks = useMemo(() => {
    let result = tasks

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
  }, [tasks, caseTypeFilter, taskTypeFilter, sortOrder])

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

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h3 className="mt-4 text-lg font-semibold">All caught up &mdash; no pending reviews</h3>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and sorting */}
      <div className="flex flex-wrap items-center gap-3">
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
            <BanjoBundleCard key={bundle.assignmentId} bundle={bundle} />
          ))}

          {/* Standalone tasks */}
          {standaloneTasks.map((task) => (
            <Card
              key={task.id}
              className={
                isOlderThan48Hours(task.createdAt)
                  ? "border-l-4 border-l-yellow-400"
                  : ""
              }
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
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
    </div>
  )
}
