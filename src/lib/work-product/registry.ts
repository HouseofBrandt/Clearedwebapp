/**
 * Work Product Registry
 *
 * Central catalog of all 13 AI output types. Each entry describes the task type,
 * its display metadata, which surfaces it appears on, and which tuning dimensions
 * practitioners can customize.
 */

export type WorkProductCategory = "case_analysis" | "work_product" | "correspondence" | "research"

export type TunableDimension = "tone" | "structure" | "length" | "emphasis" | "avoidances" | "custom"

export type Surface = "banjo" | "chat" | "direct"

export interface WorkProductEntry {
  taskType: string
  displayName: string
  description: string
  icon: string
  category: WorkProductCategory
  promptFile: string | null
  surfaces: Surface[]
  typicalLength: string
  supportsExamples: boolean
  tunableDimensions: TunableDimension[]
}

const FULL_DIMENSIONS: TunableDimension[] = ["tone", "structure", "length", "emphasis", "avoidances", "custom"]
const REDUCED_DIMENSIONS: TunableDimension[] = ["emphasis", "avoidances", "custom"]

export const WORK_PRODUCT_REGISTRY: WorkProductEntry[] = [
  // ── Case Analysis ──
  {
    taskType: "CASE_SUMMARY",
    displayName: "Case Summary",
    description: "High-level overview of case facts, posture, and recommended next steps.",
    icon: "FileText",
    category: "case_analysis",
    promptFile: "case_summary_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "1-2 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "CASE_MEMO",
    displayName: "Case Memo",
    description: "Detailed internal memorandum analyzing facts, law, and strategy for the case file.",
    icon: "BookOpen",
    category: "case_analysis",
    promptFile: "case_memo_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "3-5 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "GENERAL_ANALYSIS",
    displayName: "General Analysis",
    description: "Open-ended analysis of uploaded documents and case data.",
    icon: "Search",
    category: "case_analysis",
    promptFile: "case_analysis_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "2-4 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "RISK_ASSESSMENT",
    displayName: "Risk Assessment",
    description: "Probability-weighted analysis of case outcomes and risk factors.",
    icon: "ShieldAlert",
    category: "case_analysis",
    promptFile: "risk_assessment_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "1-3 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },

  // ── Work Product ──
  {
    taskType: "OIC_EXTRACTION",
    displayName: "Working Papers",
    description: "Structured financial extraction and RCP computation for Offer in Compromise.",
    icon: "Table",
    category: "work_product",
    promptFile: "oic_extraction_v1",
    surfaces: ["banjo", "direct"],
    typicalLength: "7-tab spreadsheet",
    supportsExamples: false,
    tunableDimensions: REDUCED_DIMENSIONS,
  },
  {
    taskType: "OIC_NARRATIVE",
    displayName: "OIC Narrative",
    description: "Compelling narrative statement for Form 656 supporting doubt as to collectibility or liability.",
    icon: "PenTool",
    category: "work_product",
    promptFile: "oic_narrative_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "2-4 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "IA_ANALYSIS",
    displayName: "Installment Agreement Analysis",
    description: "Payment plan calculation and compliance analysis under IRC \u00a7 6159.",
    icon: "Calculator",
    category: "work_product",
    promptFile: "ia_analysis_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "2-3 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "CNC_ANALYSIS",
    displayName: "Currently Not Collectible Analysis",
    description: "Financial hardship analysis for CNC status determination.",
    icon: "PauseCircle",
    category: "work_product",
    promptFile: "cnc_analysis_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "2-3 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "TFRP_ANALYSIS",
    displayName: "Trust Fund Recovery Penalty Analysis",
    description: "IRC \u00a7 6672 responsible person and willfulness analysis.",
    icon: "Gavel",
    category: "work_product",
    promptFile: "tfrp_analysis_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "3-5 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "INNOCENT_SPOUSE_ANALYSIS",
    displayName: "Innocent Spouse Analysis",
    description: "IRC \u00a7 6015 relief eligibility analysis across all three subsections.",
    icon: "Heart",
    category: "work_product",
    promptFile: "innocent_spouse_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "3-5 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },

  // ── Correspondence ──
  {
    taskType: "PENALTY_LETTER",
    displayName: "Penalty Abatement Letter",
    description: "Formal letter requesting IRS penalty abatement under reasonable cause or first-time abatement.",
    icon: "Mail",
    category: "correspondence",
    promptFile: "penalty_abatement_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "2-3 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },
  {
    taskType: "APPEALS_REBUTTAL",
    displayName: "Appeals Rebuttal",
    description: "Written rebuttal or protest for IRS Appeals conference or CDP hearing.",
    icon: "Scale",
    category: "correspondence",
    promptFile: "appeals_rebuttal_v1",
    surfaces: ["banjo", "chat", "direct"],
    typicalLength: "3-6 pages",
    supportsExamples: true,
    tunableDimensions: FULL_DIMENSIONS,
  },

  // ── Research ──
  {
    taskType: "WEB_RESEARCH",
    displayName: "Web Research",
    description: "Internet research on tax law topics, IRS procedures, and case-relevant questions.",
    icon: "Globe",
    category: "research",
    promptFile: null,
    surfaces: ["chat"],
    typicalLength: "1-3 pages",
    supportsExamples: false,
    tunableDimensions: REDUCED_DIMENSIONS,
  },
]

const registryMap = new Map<string, WorkProductEntry>(
  WORK_PRODUCT_REGISTRY.map((e) => [e.taskType, e])
)

/**
 * Return registry entries grouped by category.
 */
export function getRegistryByCategory(): Record<WorkProductCategory, WorkProductEntry[]> {
  const grouped: Record<WorkProductCategory, WorkProductEntry[]> = {
    case_analysis: [],
    work_product: [],
    correspondence: [],
    research: [],
  }
  for (const entry of WORK_PRODUCT_REGISTRY) {
    grouped[entry.category].push(entry)
  }
  return grouped
}

/**
 * Return a single registry entry by taskType, or undefined if not found.
 */
export function getRegistryEntry(taskType: string): WorkProductEntry | undefined {
  return registryMap.get(taskType)
}
