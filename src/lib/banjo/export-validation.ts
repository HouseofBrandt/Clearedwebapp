/**
 * Pre-export validation for Banjo assignments.
 * Checks deliverables for completeness before allowing export.
 */

export interface ValidationError {
  taskId: string
  stepNumber: number
  stepLabel: string
  errors: string[]
  severity: "error" | "warning"
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

/**
 * Validate all approved tasks in an assignment before export.
 */
export function validateForExport(
  tasks: Array<{
    id: string
    taskType: string
    status: string
    detokenizedOutput: string | null
    banjoStepNumber: number | null
    banjoStepLabel: string | null
    verifyFlagCount: number
    judgmentFlagCount: number
  }>
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  for (const task of tasks) {
    const taskErrors: string[] = []
    const taskWarnings: string[] = []

    const output = task.detokenizedOutput || ""
    const stepLabel = task.banjoStepLabel || task.taskType

    // 1. Empty or very short output
    if (!output.trim()) {
      taskErrors.push("Output is empty")
    } else if (output.trim().length < 50) {
      taskErrors.push("Output is suspiciously short (under 50 characters)")
    }

    // 2. Check for incomplete markers
    if (output.includes("[TODO]") || output.includes("[TBD]") || output.includes("[PLACEHOLDER]")) {
      taskErrors.push("Output contains incomplete markers ([TODO], [TBD], or [PLACEHOLDER])")
    }

    // 3. Check for unresolved template variables
    const unresolvedTemplates = output.match(/\{\{[^}]+\}\}/g)
    if (unresolvedTemplates && unresolvedTemplates.length > 0) {
      taskErrors.push(`Output contains ${unresolvedTemplates.length} unresolved template variable(s): ${unresolvedTemplates.slice(0, 3).join(", ")}`)
    }

    // 4. VERIFY flags — warn if high count
    if (task.verifyFlagCount > 5) {
      taskWarnings.push(`High number of [VERIFY] flags (${task.verifyFlagCount}). Review carefully before sending to client.`)
    } else if (task.verifyFlagCount > 0) {
      taskWarnings.push(`${task.verifyFlagCount} [VERIFY] flag(s) require practitioner verification`)
    }

    // 5. JUDGMENT flags
    if (task.judgmentFlagCount > 0) {
      taskWarnings.push(`${task.judgmentFlagCount} [PRACTITIONER JUDGMENT] flag(s) require professional review`)
    }

    // 6. Check for malformed output in spreadsheet tasks
    if (task.taskType === "WORKING_PAPERS") {
      try {
        const parsed = JSON.parse(output)
        if (!parsed.merged && !parsed.extracted) {
          taskErrors.push("Working papers output is missing required data structure (merged/extracted)")
        }
      } catch {
        // Not JSON — might be fine for narrative working papers, but warn
        taskWarnings.push("Working papers output is not in structured JSON format — will export as Word document instead of Excel")
      }
    }

    // 7. Check for common formatting issues
    if (output.includes("```") && !task.taskType.includes("ANALYSIS")) {
      taskWarnings.push("Output contains code blocks which may not render correctly in exported documents")
    }

    if (taskErrors.length > 0) {
      errors.push({
        taskId: task.id,
        stepNumber: task.banjoStepNumber || 0,
        stepLabel,
        errors: taskErrors,
        severity: "error",
      })
    }

    if (taskWarnings.length > 0) {
      warnings.push({
        taskId: task.id,
        stepNumber: task.banjoStepNumber || 0,
        stepLabel,
        errors: taskWarnings,
        severity: "warning",
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
