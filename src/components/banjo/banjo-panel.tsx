"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/toast"
import { BanjoIcon } from "./banjo-icon"
import { AssignmentInput } from "./assignment-input"
import { BanjoClarification } from "./clarification"
import { BanjoPlanReview } from "./plan-review"
import { BanjoProgress } from "./progress"
import { BanjoComplete } from "./complete"
import { BanjoHistory } from "./history"

type BanjoPhase = "idle" | "planning" | "clarifying" | "plan_review" | "executing" | "completed" | "failed"

interface DeliverableProgress {
  step: number
  label: string
  status: "waiting" | "generating" | "complete" | "failed" | "skipped"
  percent?: number
  taskId?: string
  verifyFlagCount?: number
  judgmentFlagCount?: number
  error?: string
  format?: string
}

interface BanjoPanelProps {
  caseId: string
  caseType: string
  caseData: {
    caseNumber: string
    clientName: string
    filingStatus?: string
    status: string
  }
  documentCount: number
  documentsWithTextCount: number
  existingTasks: {
    id: string
    taskType: string
    status: string
    createdAt: string
    banjoAssignmentId?: string | null
    banjoStepLabel?: string | null
  }[]
}

export function BanjoPanel({ caseId, caseType, caseData, documentCount, documentsWithTextCount, existingTasks }: BanjoPanelProps) {
  const [phase, setPhase] = useState<BanjoPhase>("idle")
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [plan, setPlan] = useState<any>(null)
  const [model, setModel] = useState("claude-opus-4-6")
  const [skipRevision, setSkipRevision] = useState(false)
  const [deliverables, setDeliverables] = useState<DeliverableProgress[]>([])
  const [completedTasks, setCompletedTasks] = useState<any[]>([])
  const [failedSteps, setFailedSteps] = useState<number[]>([])
  const [skippedSteps, setSkippedSteps] = useState<number[]>([])
  const [overallPercent, setOverallPercent] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [revisionStatus, setRevisionStatus] = useState<"waiting" | "running" | "complete" | "failed" | "skipped" | "not_run">("waiting")
  const [revisionSummary, setRevisionSummary] = useState<string | undefined>()
  const [revisedCount, setRevisedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const router = useRouter()
  const { addToast } = useToast()

  const existingTaskTypes = existingTasks.map((t) => t.taskType)

  // Navigate-away recovery: check for active assignments on mount
  useEffect(() => {
    async function checkActive() {
      try {
        const res = await fetch(`/api/banjo/active?caseId=${caseId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!data.assignment) return

        setAssignmentId(data.assignment.id)
        setPlan(data.assignment.plan)
        setModel(data.assignment.model || "claude-opus-4-6")

        if (data.assignment.status === "EXECUTING" || data.assignment.status === "POLISHING") {
          setPhase("executing")
          // Reconstruct deliverable progress from tasks
          const planDeliverables = data.assignment.plan?.deliverables || []
          const initialDeliverables: DeliverableProgress[] = planDeliverables.map((d: any) => {
            const task = data.assignment.tasks?.find((t: any) => t.banjoStepNumber === d.stepNumber)
            return {
              step: d.stepNumber,
              label: d.label,
              status: task
                ? task.status === "READY_FOR_REVIEW" || task.status === "APPROVED" ? "complete" as const
                : task.status === "SKIPPED" ? "skipped" as const
                : task.status === "REJECTED" ? "failed" as const
                : "generating" as const
                : "waiting" as const,
              format: d.format,
              taskId: task?.id,
            }
          })
          setDeliverables(initialDeliverables)
          if (data.assignment.status === "POLISHING") {
            setRevisionStatus("running")
          }
          startTimer()
          startPolling(data.assignment.id)
        } else if (data.assignment.status === "COMPLETED") {
          // Reconstruct completed state
          const tasks = data.assignment.tasks?.filter((t: any) =>
            t.status === "READY_FOR_REVIEW" || t.status === "APPROVED"
          ) || []
          setCompletedTasks(tasks.map((t: any) => ({
            step: t.banjoStepNumber,
            taskId: t.id,
            label: t.banjoStepLabel || t.taskType,
            format: "docx",
            verifyFlagCount: t.verifyFlagCount || 0,
            judgmentFlagCount: t.judgmentFlagCount || 0,
          })))
          setRevisionStatus(data.assignment.revisionRan ? "complete" : "not_run")
          setRevisionSummary(data.assignment.revisionResult || undefined)
          setPhase("completed")
        }
      } catch { /* ignore */ }
    }
    checkActive()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  function startPolling(id: string) {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/banjo/${id}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === "COMPLETED" || data.status === "FAILED") {
          if (pollingRef.current) clearInterval(pollingRef.current)
          stopTimer()
          if (data.status === "COMPLETED") {
            const tasks = data.tasks?.filter((t: any) =>
              t.status === "READY_FOR_REVIEW" || t.status === "APPROVED"
            ) || []
            setCompletedTasks(tasks.map((t: any) => ({
              step: t.banjoStepNumber,
              taskId: t.id,
              label: t.banjoStepLabel || t.taskType,
              format: "docx",
              verifyFlagCount: t.verifyFlagCount || 0,
              judgmentFlagCount: t.judgmentFlagCount || 0,
            })))
            setPhase("completed")
            addToast({ title: "Assignment complete" })
            router.refresh()
          } else {
            setPhase("failed")
            setError("Assignment failed")
          }
        }
      } catch { /* ignore polling errors */ }
    }, 5000)
  }

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  async function handleSubmitAssignment(assignmentText: string, casePosture?: any, selectedModel?: string, skipRev?: boolean) {
    setPhase("planning")
    setError(null)
    const m = selectedModel || "claude-opus-4-6"
    setModel(m)
    setSkipRevision(skipRev || false)

    try {
      const res = await fetch("/api/banjo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, assignmentText, casePosture, model: m, skipRevision: skipRev }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create plan")
      }

      const data = await res.json()
      setAssignmentId(data.assignmentId)
      setPlan(data.plan)

      if (data.status === "clarifying") {
        setQuestions(data.questions || [])
        setPhase("clarifying")
      } else {
        setPhase("plan_review")
      }
    } catch (err: any) {
      setError(err.message)
      setPhase("failed")
      addToast({ title: "Error", description: err.message, variant: "destructive" })
    }
  }

  async function handleClarificationSubmit(answers: Record<string, string>, additionalNotes?: string) {
    if (!assignmentId) return
    setPhase("planning")

    try {
      const res = await fetch(`/api/banjo/${assignmentId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, additionalNotes }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to process answers")
      }

      const data = await res.json()
      setPlan(data.plan)
      setPhase("plan_review")
    } catch (err: any) {
      setError(err.message)
      setPhase("failed")
      addToast({ title: "Error", description: err.message, variant: "destructive" })
    }
  }

  async function handleClarificationSkip() {
    await handleClarificationSubmit({})
  }

  async function handleApprove() {
    if (!assignmentId || !plan) return

    const initialDeliverables: DeliverableProgress[] = plan.deliverables.map((d: any) => ({
      step: d.stepNumber,
      label: d.label,
      status: "waiting" as const,
      format: d.format,
    }))
    setDeliverables(initialDeliverables)
    setRevisionStatus(skipRevision || plan.deliverables.length <= 1 ? "skipped" : "waiting")
    setPhase("executing")
    startTimer()

    try {
      const res = await fetch(`/api/banjo/${assignmentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Execution failed")
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ""
      const completed: any[] = []
      const failed: number[] = []
      const skipped: number[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split("\n")
        lineBuffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            if (event.type === "progress") {
              setDeliverables((prev) =>
                prev.map((d) =>
                  d.step === event.step
                    ? { ...d, status: "generating", percent: event.percent }
                    : d
                )
              )
              const totalSteps = event.totalSteps || plan.deliverables.length
              const completedSteps = completed.length
              const stepProgress = event.percent || 0
              setOverallPercent(Math.round(((completedSteps + stepProgress / 100) / totalSteps) * 100))
            } else if (event.type === "step_complete") {
              const planDeliverable = plan.deliverables.find((d: any) => d.stepNumber === event.step)
              setDeliverables((prev) =>
                prev.map((d) =>
                  d.step === event.step
                    ? { ...d, status: "complete", percent: 100, taskId: event.taskId, verifyFlagCount: event.verifyFlagCount, judgmentFlagCount: event.judgmentFlagCount }
                    : d
                )
              )
              completed.push({
                step: event.step,
                taskId: event.taskId,
                label: planDeliverable?.label || `Step ${event.step}`,
                format: planDeliverable?.format || "docx",
                verifyFlagCount: event.verifyFlagCount || 0,
                judgmentFlagCount: event.judgmentFlagCount || 0,
              })
            } else if (event.type === "step_failed") {
              failed.push(event.step)
              setDeliverables((prev) =>
                prev.map((d) =>
                  d.step === event.step ? { ...d, status: "failed", error: event.error } : d
                )
              )
            } else if (event.type === "step_skipped") {
              skipped.push(event.step)
              setDeliverables((prev) =>
                prev.map((d) =>
                  d.step === event.step ? { ...d, status: "skipped" } : d
                )
              )
            } else if (event.type === "revision_started") {
              setRevisionStatus("running")
              setOverallPercent(95)
            } else if (event.type === "revision_complete") {
              setRevisionStatus("complete")
              setRevisionSummary(event.summary)
              setRevisedCount(event.revisedCount || 0)
            } else if (event.type === "complete") {
              setCompletedTasks(completed)
              setFailedSteps(event.failedSteps || failed)
              setSkippedSteps(event.skippedSteps || skipped)
              setOverallPercent(100)
              setPhase("completed")
              stopTimer()
              addToast({ title: "Assignment complete", description: `${completed.length} deliverable(s) ready for review.` })
              router.refresh()
            } else if (event.type === "failed") {
              setError(event.error)
              setPhase("failed")
              stopTimer()
              addToast({ title: "Assignment failed", description: event.error, variant: "destructive" })
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      // Handle remaining buffer
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer)
          if (event.type === "complete") {
            setCompletedTasks(completed)
            setOverallPercent(100)
            setPhase("completed")
            stopTimer()
            router.refresh()
          }
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      stopTimer()
      setError(err.message)
      setPhase("failed")
      addToast({ title: "Execution failed", description: err.message, variant: "destructive" })
    }
  }

  function handleCancel() {
    if (assignmentId) {
      fetch(`/api/banjo/${assignmentId}/cancel`, { method: "POST" }).catch(() => {})
    }
    if (pollingRef.current) clearInterval(pollingRef.current)
    stopTimer()
    resetState()
  }

  function resetState() {
    setPhase("idle")
    setAssignmentId(null)
    setQuestions([])
    setPlan(null)
    setDeliverables([])
    setCompletedTasks([])
    setFailedSteps([])
    setSkippedSteps([])
    setOverallPercent(0)
    setElapsedSeconds(0)
    setRevisionStatus("waiting")
    setRevisionSummary(undefined)
    setRevisedCount(0)
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BanjoIcon className="h-5 w-5" animated={phase === "executing"} />
          Banjo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === "idle" && (
          <AssignmentInput
            caseType={caseType}
            existingTaskTypes={existingTaskTypes}
            onSubmit={handleSubmitAssignment}
            disabled={documentCount === 0}
          />
        )}

        {phase === "planning" && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <BanjoIcon className="h-5 w-5" animated />
            <span className="text-sm text-muted-foreground">Banjo is reviewing your assignment...</span>
          </div>
        )}

        {phase === "clarifying" && (
          <BanjoClarification
            questions={questions}
            onSubmit={handleClarificationSubmit}
            onSkip={handleClarificationSkip}
          />
        )}

        {phase === "plan_review" && plan && (
          <BanjoPlanReview
            plan={plan}
            model={model}
            onApprove={handleApprove}
            onCancel={handleCancel}
          />
        )}

        {phase === "executing" && (
          <BanjoProgress
            deliverables={deliverables}
            overallPercent={overallPercent}
            elapsedSeconds={elapsedSeconds}
            revisionStatus={revisionStatus === "not_run" ? "waiting" : revisionStatus}
            revisionSummary={revisionSummary}
          />
        )}

        {phase === "completed" && completedTasks.length > 0 && (
          <>
            <BanjoComplete
              tasks={completedTasks}
              totalTimeSeconds={elapsedSeconds}
              model={model}
              failedSteps={failedSteps}
              skippedSteps={skippedSteps}
              revisionStatus={revisionStatus === "waiting" || revisionStatus === "running" ? "not_run" : revisionStatus}
              revisionSummary={revisionSummary}
              revisedCount={revisedCount}
            />
            <div className="pt-2">
              <button type="button" onClick={resetState} className="text-sm text-primary hover:underline">
                Start a new assignment
              </button>
            </div>
          </>
        )}

        {phase === "failed" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Assignment failed</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <button type="button" onClick={resetState} className="text-sm text-primary hover:underline">
              Try again
            </button>
          </div>
        )}

        {documentCount === 0 && phase === "idle" && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Upload documents first, then come back to Banjo.
          </p>
        )}

        {(phase === "idle" || phase === "completed") && existingTasks.length > 0 && (
          <>
            <Separator />
            <BanjoHistory tasks={existingTasks} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
