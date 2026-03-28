/**
 * Prompt Merger — Work Product Controls
 *
 * Builds a practitioner-preference block that gets injected into AI prompts
 * based on per-user, per-task-type overrides stored in the database.
 */

import { prisma } from "@/lib/db"

const MAX_EXAMPLE_LENGTH = 2000

/**
 * Build the practitioner-preference prompt block for a given user and task type.
 * Returns an empty string if no override exists or the override is disabled.
 */
export async function getWorkProductPromptBlock(
  userId: string,
  taskType: string
): Promise<string> {
  const override = await prisma.workProductOverride.findUnique({
    where: { userId_taskType: { userId, taskType } },
    include: { examples: true },
  })

  if (!override || !override.isEnabled) {
    return ""
  }

  const lines: string[] = []
  lines.push("")
  lines.push("═══ PRACTITIONER PREFERENCES ═══")
  lines.push("")

  if (override.toneDirective) {
    lines.push(`TONE: ${override.toneDirective}`)
    lines.push("")
  }

  if (override.structureDirective) {
    lines.push(`STRUCTURE: ${override.structureDirective}`)
    lines.push("")
  }

  if (override.lengthDirective) {
    lines.push(`LENGTH: ${override.lengthDirective}`)
    lines.push("")
  }

  if (override.emphasisAreas) {
    lines.push(`EMPHASIS AREAS: ${override.emphasisAreas}`)
    lines.push("")
  }

  if (override.avoidances) {
    lines.push(`AVOIDANCES: ${override.avoidances}`)
    lines.push("")
  }

  if (override.customInstructions) {
    lines.push(`CUSTOM INSTRUCTIONS: ${override.customInstructions}`)
    lines.push("")
  }

  // Good examples
  const goodExamples = override.examples.filter((e) => e.isGoodExample)
  if (goodExamples.length > 0) {
    lines.push("MODEL EXAMPLES")
    lines.push("The practitioner considers the following examples to represent the quality and style they want:")
    lines.push("")
    for (const ex of goodExamples) {
      lines.push(`--- Example: ${ex.label} ---`)
      const content = ex.content.length > MAX_EXAMPLE_LENGTH
        ? ex.content.slice(0, MAX_EXAMPLE_LENGTH) + "\n[...truncated]"
        : ex.content
      lines.push(content)
      if (ex.notes) {
        lines.push(`Practitioner note: ${ex.notes}`)
      }
      lines.push("")
    }
  }

  // Anti-examples
  const antiExamples = override.examples.filter((e) => !e.isGoodExample)
  if (antiExamples.length > 0) {
    lines.push("AVOID PRODUCING OUTPUT LIKE THIS")
    lines.push("The practitioner considers the following examples to represent output they do NOT want:")
    lines.push("")
    for (const ex of antiExamples) {
      lines.push(`--- Anti-example: ${ex.label} ---`)
      const content = ex.content.length > MAX_EXAMPLE_LENGTH
        ? ex.content.slice(0, MAX_EXAMPLE_LENGTH) + "\n[...truncated]"
        : ex.content
      lines.push(content)
      if (ex.notes) {
        lines.push(`Practitioner note: ${ex.notes}`)
      }
      lines.push("")
    }
  }

  lines.push("═══ END PRACTITIONER PREFERENCES ═══")
  lines.push("")

  return lines.join("\n")
}
