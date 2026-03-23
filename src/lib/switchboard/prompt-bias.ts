import { getReviewInsights } from "@/lib/switchboard/review-insights"

/**
 * Generates task-specific prompt bias from historical review patterns.
 * Injected into Banjo deliverable prompts during execution.
 *
 * Example output:
 * "REVIEWER EXPECTATIONS FOR OIC CASE SUMMARIES:
 *  • The RCP calculation section is edited 60% of the time. Double-check all QSV calculations.
 *  • Practitioners frequently strengthen the reasonable cause argument. Make this section thorough."
 */
export async function getPromptBias(
  caseType: string,
  taskType: string
): Promise<string | null> {
  const insights = await getReviewInsights(caseType)
  if (!insights) return null

  const taskTypeLower = taskType.replace(/_/g, " ").toLowerCase()

  // Filter to patterns relevant to this task type or generic patterns
  const lines = insights.split("\n").filter(line => {
    if (!line.startsWith("•")) return false
    // Include if line mentions this task type, or is a generic pattern
    return line.toLowerCase().includes(taskTypeLower) ||
      !line.toLowerCase().includes(" in ") // Generic patterns that don't specify a task type
  })

  if (lines.length === 0) return null

  return `REVIEWER EXPECTATIONS FOR ${taskType.replace(/_/g, " ")}:\n` +
    `Based on prior review patterns for ${caseType} cases, pay extra attention to:\n` +
    lines.join("\n") +
    `\nAddress these areas proactively. Provide thorough analysis where reviewers commonly request more depth.`
}
