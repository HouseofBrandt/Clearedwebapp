import { prisma } from "@/lib/db"

interface ReviewPattern {
  taskType: string
  pattern: string
  frequency: number
  example: string
}

/**
 * Analyzes historical review behavior for a given case type.
 * Returns a plain-text summary of common corrections that AI should anticipate.
 *
 * This closes the learning loop:
 * Phase 8 stores the data → this function reads it → Module 1 injects it into prompts.
 */
export async function getReviewInsights(caseType: string): Promise<string | null> {
  const [rejections, edits] = await Promise.all([
    prisma.rejectionFeedback.findMany({
      where: { caseType },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { taskType: true, correctionNotes: true },
    }),
    prisma.editHistory.findMany({
      where: { caseType },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { taskType: true, originalOutput: true, editedOutput: true },
    }),
  ])

  if (rejections.length === 0 && edits.length === 0) return null

  const patterns: ReviewPattern[] = []

  // Analyze rejection patterns by task type
  const rejectionsByType = groupBy(rejections, "taskType")
  for (const [taskType, items] of Object.entries(rejectionsByType)) {
    if (items.length >= 2) {
      const themes = extractThemes(items.map(i => i.correctionNotes))
      for (const theme of themes) {
        patterns.push({
          taskType,
          pattern: `Practitioners frequently reject ${formatTaskType(taskType)} outputs because: ${theme.summary}`,
          frequency: theme.count,
          example: theme.example,
        })
      }
    }
  }

  // Analyze edit patterns — what sections get changed?
  const editsByType = groupBy(edits, "taskType")
  for (const [taskType, items] of Object.entries(editsByType)) {
    if (items.length >= 3) {
      const sectionEdits = detectEditedSections(items)
      for (const section of sectionEdits) {
        patterns.push({
          taskType,
          pattern: `The ${section.name} section in ${formatTaskType(taskType)} is edited ${section.frequency} out of ${items.length} times. Common change: ${section.commonChange}`,
          frequency: section.frequency,
          example: section.example,
        })
      }
    }
  }

  if (patterns.length === 0) return null

  const sortedPatterns = patterns
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5)

  let text = ""
  for (const p of sortedPatterns) {
    text += `• ${p.pattern}\n`
  }
  text += `\nUse these patterns to anticipate what the reviewer will expect. Address these areas proactively in your output.`

  return text
}

/**
 * Extracts common themes from correction notes using keyword clustering.
 * No AI call — deterministic keyword extraction.
 */
function extractThemes(notes: string[]): Array<{ summary: string; count: number; example: string }> {
  const themes: Map<string, { count: number; examples: string[] }> = new Map()

  const THEME_PATTERNS: Array<{ regex: RegExp; label: string }> = [
    { regex: /RCP|reasonable collection potential|offer amount/i, label: "RCP calculation needs correction" },
    { regex: /penalty|abat|reasonable cause/i, label: "penalty/reasonable cause argument is weak" },
    { regex: /missing|include|add|didn't mention|no mention/i, label: "key information was omitted" },
    { regex: /crypto|virtual currency|digital asset/i, label: "cryptocurrency/digital asset treatment" },
    { regex: /dissipated|transfer|related party/i, label: "dissipated asset or related-party analysis" },
    { regex: /CSED|statute|expir/i, label: "CSED or statute analysis" },
    { regex: /income|wage|self.employ|business/i, label: "income calculation or characterization" },
    { regex: /asset|property|vehicle|real estate/i, label: "asset valuation" },
    { regex: /expense|allowable|IRS standard/i, label: "allowable expense analysis" },
    { regex: /compliance|return|filing/i, label: "compliance or filing status" },
  ]

  for (const note of notes) {
    for (const { regex, label } of THEME_PATTERNS) {
      if (regex.test(note)) {
        const existing = themes.get(label) || { count: 0, examples: [] }
        existing.count++
        if (existing.examples.length < 2) existing.examples.push(note.substring(0, 150))
        themes.set(label, existing)
      }
    }
  }

  return Array.from(themes.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([label, v]) => ({
      summary: label,
      count: v.count,
      example: v.examples[0],
    }))
}

/**
 * Detects which sections of a document type are commonly edited.
 * Compares original vs edited output to find which markdown sections changed.
 */
function detectEditedSections(
  edits: Array<{ originalOutput: string; editedOutput: string }>
): Array<{ name: string; frequency: number; commonChange: string; example: string }> {
  const sectionChanges: Map<string, { count: number; changes: string[] }> = new Map()

  for (const edit of edits) {
    const originalSections = extractSections(edit.originalOutput)
    const editedSections = extractSections(edit.editedOutput)

    for (const [heading, originalContent] of Array.from(originalSections.entries())) {
      const editedContent = editedSections.get(heading)
      if (editedContent && editedContent !== originalContent) {
        const existing = sectionChanges.get(heading) || { count: 0, changes: [] }
        existing.count++
        const diff = describeDifference(originalContent, editedContent)
        if (existing.changes.length < 3) existing.changes.push(diff)
        sectionChanges.set(heading, existing)
      }
    }
  }

  return Array.from(sectionChanges.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([name, v]) => ({
      name,
      frequency: v.count,
      commonChange: v.changes[0],
      example: v.changes[0],
    }))
}

function extractSections(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = text.split("\n")
  let currentHeading = "Introduction"
  let currentContent: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.set(currentHeading, currentContent.join("\n").trim())
      }
      currentHeading = headingMatch[1].trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentContent.length > 0) {
    sections.set(currentHeading, currentContent.join("\n").trim())
  }
  return sections
}

function describeDifference(original: string, edited: string): string {
  const lenDiff = edited.length - original.length
  if (lenDiff > 200) return "content was expanded significantly"
  if (lenDiff < -200) return "content was shortened"
  return "content was revised in place"
}

function formatTaskType(taskType: string): string {
  return taskType.replace(/_/g, " ").toLowerCase()
}

function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const k = String(item[key])
    if (!groups[k]) groups[k] = []
    groups[k].push(item)
  }
  return groups
}
