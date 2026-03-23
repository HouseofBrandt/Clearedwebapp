/**
 * DAG-aware parallel executor for Banjo deliverables.
 * Independent deliverables run in parallel; dependent ones wait for prerequisites.
 */

export interface DeliverablePlan {
  stepNumber: number
  label: string
  description: string
  format: string
  taskType: string
  dependsOn: number[]
  dataSources?: string[]
}

export interface PriorOutput {
  step: number
  taskId: string
  output: string
  label: string
  format: string
}

export interface CompletedTask {
  step: number
  taskId: string
  output: string
  label: string
  format: string
  verifyFlagCount: number
  judgmentFlagCount: number
}

export interface DagProgressEvent {
  type: "step_started" | "step_complete" | "step_failed" | "step_skipped" | "parallel_started"
  step?: number
  steps?: number[]
  taskId?: string
  verifyFlagCount?: number
  judgmentFlagCount?: number
  error?: string
  reason?: string
  percent?: number
  label?: string
  phase?: string
}

export async function executeDag(
  deliverables: DeliverablePlan[],
  executeOne: (deliverable: DeliverablePlan, priorOutputs: PriorOutput[]) => Promise<CompletedTask>,
  onProgress: (event: DagProgressEvent) => void
): Promise<{ completed: CompletedTask[]; failed: number[]; skipped: number[] }> {
  const completed = new Map<number, CompletedTask>()
  const failed = new Set<number>()
  const skipped = new Set<number>()
  const running = new Map<number, Promise<{ step: number; task: CompletedTask }>>()

  function getReady(): DeliverablePlan[] {
    return deliverables.filter((d) =>
      !completed.has(d.stepNumber) &&
      !failed.has(d.stepNumber) &&
      !skipped.has(d.stepNumber) &&
      !running.has(d.stepNumber) &&
      d.dependsOn.every((dep) => completed.has(dep)) &&
      !d.dependsOn.some((dep) => failed.has(dep) || skipped.has(dep))
    )
  }

  function markSkippable(): void {
    const toSkip = deliverables.filter((d) =>
      !completed.has(d.stepNumber) &&
      !failed.has(d.stepNumber) &&
      !skipped.has(d.stepNumber) &&
      !running.has(d.stepNumber) &&
      d.dependsOn.some((dep) => failed.has(dep) || skipped.has(dep))
    )
    for (const d of toSkip) {
      skipped.add(d.stepNumber)
      onProgress({ type: "step_skipped", step: d.stepNumber, reason: "Dependency failed", label: d.label })
    }
  }

  while (completed.size + failed.size + skipped.size < deliverables.length) {
    markSkippable()

    const ready = getReady()

    if (ready.length === 0 && running.size === 0) break // All done or deadlocked

    // Notify about parallel execution
    if (ready.length > 1) {
      onProgress({ type: "parallel_started", steps: ready.map((d) => d.stepNumber) })
    }

    // Launch all ready deliverables
    for (const d of ready) {
      const priorOutputs: PriorOutput[] = d.dependsOn
        .map((dep) => {
          const c = completed.get(dep)
          if (!c) return null
          return { step: c.step, taskId: c.taskId, output: c.output, label: c.label, format: c.format }
        })
        .filter(Boolean) as PriorOutput[]

      onProgress({ type: "step_started", step: d.stepNumber, label: d.label, phase: "starting", percent: 0 })

      const promise = executeOne(d, priorOutputs)
        .then((task) => ({ step: d.stepNumber, task }))
        .catch((err) => {
          throw Object.assign(new Error(err.message || "Failed"), { _stepNumber: d.stepNumber })
        })

      running.set(d.stepNumber, promise)
    }

    if (running.size === 0) break

    // Wait for any one to finish
    const racePromises = Array.from(running.entries()).map(([step, promise]) =>
      promise.catch((err: any) => {
        // Convert rejection to a resolved value we can handle
        return { step, task: null as any, error: err }
      })
    )

    const result = await Promise.race(racePromises) as any

    if (result.error) {
      const stepNum = result.error._stepNumber || result.step
      failed.add(stepNum)
      running.delete(stepNum)
      onProgress({ type: "step_failed", step: stepNum, error: result.error.message })
    } else {
      completed.set(result.step, result.task)
      running.delete(result.step)
      onProgress({
        type: "step_complete",
        step: result.step,
        taskId: result.task.taskId,
        verifyFlagCount: result.task.verifyFlagCount,
        judgmentFlagCount: result.task.judgmentFlagCount,
      })
    }
  }

  // Wait for any still-running tasks to complete
  for (const [step, promise] of Array.from(running.entries())) {
    try {
      const result = await promise
      completed.set(step, result.task)
      onProgress({
        type: "step_complete",
        step,
        taskId: result.task.taskId,
        verifyFlagCount: result.task.verifyFlagCount,
        judgmentFlagCount: result.task.judgmentFlagCount,
      })
    } catch (err: any) {
      failed.add(step)
      onProgress({ type: "step_failed", step, error: err.message })
    }
  }

  return {
    completed: Array.from(completed.values()),
    failed: Array.from(failed),
    skipped: Array.from(skipped),
  }
}
