/**
 * Parses Claude's OIC analysis text output into structured data
 * for spreadsheet generation and editing.
 */

export interface OICWorkingPaper {
  taxpayerInfo: Record<string, string>[]
  liabilitySummary: Record<string, string>[]
  incomeAnalysis: Record<string, string>[]
  expenseAnalysis: Record<string, string>[]
  assetAnalysis: Record<string, string>[]
  rcpCalculation: Record<string, string>[]
  offerRecommendation: Record<string, string>[]
  flagsAndNotes: Record<string, string>[]
}

const SECTION_HEADERS = [
  { key: "taxpayerInfo", patterns: ["TAXPAYER INFORMATION", "1."] },
  { key: "liabilitySummary", patterns: ["LIABILITY SUMMARY", "2."] },
  { key: "incomeAnalysis", patterns: ["INCOME ANALYSIS", "3."] },
  { key: "expenseAnalysis", patterns: ["EXPENSE ANALYSIS", "4."] },
  { key: "assetAnalysis", patterns: ["ASSET ANALYSIS", "5."] },
  { key: "rcpCalculation", patterns: ["RCP CALCULATION", "6."] },
  { key: "offerRecommendation", patterns: ["OIC OFFER", "OFFER AMOUNT", "7."] },
  { key: "flagsAndNotes", patterns: ["FLAGS AND NOTES", "FLAGS", "8."] },
]

function findSectionStart(lines: string[], patterns: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase().trim()
    for (const pattern of patterns) {
      if (upper.includes(pattern.toUpperCase())) {
        return i
      }
    }
  }
  return -1
}

function parseSectionLines(lines: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("---")) continue

    // Try to parse "Key: Value" or "- Key: Value" format
    const kvMatch = trimmed.match(/^[-•*]?\s*(.+?):\s*(.+)$/)
    if (kvMatch) {
      rows.push({ Item: kvMatch[1].trim(), Value: kvMatch[2].trim() })
      continue
    }

    // Try to parse tabular data with pipes: | Col1 | Col2 | Col3 |
    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
      if (cells.length >= 2 && !cells.every((c) => c.match(/^[-=]+$/))) {
        // Check if this is a header row (first tabular row we see)
        if (rows.length === 0 || !rows[0]._isHeader) {
          const headerRow: Record<string, string> = { _isHeader: "true" }
          cells.forEach((c, i) => (headerRow[`Col${i}`] = c))
          rows.push(headerRow)
        } else {
          const dataRow: Record<string, string> = {}
          cells.forEach((c, i) => (dataRow[`Col${i}`] = c))
          rows.push(dataRow)
        }
        continue
      }
      continue // skip separator rows
    }

    // Dollar amount lines: "Total: $1,234"
    const dollarMatch = trimmed.match(/^(.+?)\s+\$?([\d,]+\.?\d*)$/)
    if (dollarMatch) {
      rows.push({ Item: dollarMatch[1].trim(), Value: `$${dollarMatch[2]}` })
      continue
    }

    // Bullet or numbered items without key:value
    const bulletMatch = trimmed.match(/^[-•*\d.)]+\s+(.+)$/)
    if (bulletMatch) {
      rows.push({ Item: bulletMatch[1], Value: "" })
      continue
    }

    // Plain text line - include as note
    if (trimmed.length > 3) {
      rows.push({ Item: trimmed, Value: "" })
    }
  }

  // Clean up _isHeader markers
  return rows.map((r) => {
    const clean = { ...r }
    delete clean._isHeader
    return clean
  })
}

export function parseOICOutput(text: string): OICWorkingPaper {
  const lines = text.split("\n")

  // Find section boundaries
  const sectionStarts: { key: string; start: number }[] = []
  for (const section of SECTION_HEADERS) {
    const start = findSectionStart(lines, section.patterns)
    if (start >= 0) {
      sectionStarts.push({ key: section.key, start })
    }
  }

  // Sort by position
  sectionStarts.sort((a, b) => a.start - b.start)

  // Extract each section's lines
  const result: OICWorkingPaper = {
    taxpayerInfo: [],
    liabilitySummary: [],
    incomeAnalysis: [],
    expenseAnalysis: [],
    assetAnalysis: [],
    rcpCalculation: [],
    offerRecommendation: [],
    flagsAndNotes: [],
  }

  for (let i = 0; i < sectionStarts.length; i++) {
    const current = sectionStarts[i]
    const nextStart = i + 1 < sectionStarts.length ? sectionStarts[i + 1].start : lines.length
    const sectionLines = lines.slice(current.start + 1, nextStart)
    ;(result as any)[current.key] = parseSectionLines(sectionLines)
  }

  // If no sections were found, put everything in a general section
  if (sectionStarts.length === 0) {
    result.taxpayerInfo = parseSectionLines(lines)
  }

  return result
}

/**
 * Convert structured OIC data back to tab-structured array format
 * suitable for spreadsheet rendering and export.
 */
export function oicToSpreadsheetData(oic: OICWorkingPaper): {
  name: string
  columns: string[]
  rows: string[][]
}[] {
  const tabs = [
    { name: "Taxpayer Info", data: oic.taxpayerInfo },
    { name: "Liability Summary", data: oic.liabilitySummary },
    { name: "Income Analysis", data: oic.incomeAnalysis },
    { name: "Expense Analysis", data: oic.expenseAnalysis },
    { name: "Asset Analysis", data: oic.assetAnalysis },
    { name: "RCP Calculation", data: oic.rcpCalculation },
    { name: "Offer Recommendation", data: oic.offerRecommendation },
    { name: "Flags & Notes", data: oic.flagsAndNotes },
  ]

  return tabs.map((tab) => {
    if (tab.data.length === 0) {
      return { name: tab.name, columns: ["Item", "Value"], rows: [] }
    }

    // Determine columns from the data
    const allKeys = new Set<string>()
    tab.data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)))
    const columns = Array.from(allKeys)

    const rows = tab.data.map((row) => columns.map((col) => row[col] || ""))

    return { name: tab.name, columns, rows }
  })
}
