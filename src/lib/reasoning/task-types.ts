/**
 * Reasoning Layer — Task Type Registry
 *
 * Maps each generation context to evaluation expectations.
 * The evaluator uses these configs to select the right rubric.
 */

export type TaskType =
  | "case_summary"
  | "form_narrative"
  | "client_letter"
  | "internal_memo"
  | "case_memo"
  | "transcript_analysis"
  | "deadline_calculation"
  | "resolution_recommendation"
  | "general"

export interface TaskTypeConfig {
  taskType: TaskType
  displayName: string
  maxTokens: number
  minTokens: number
  requiresSourceGrounding: boolean
  allowsInference: boolean
  formattingStandard: "prose" | "structured" | "form_field"
  criticalCriteria: string[]
  description: string
}

export const TASK_TYPE_CONFIGS: Record<TaskType, TaskTypeConfig> = {
  case_summary: {
    taskType: "case_summary",
    displayName: "Case Summary",
    maxTokens: 1500,
    minTokens: 200,
    requiresSourceGrounding: true,
    allowsInference: false,
    formattingStandard: "prose",
    criticalCriteria: ["task_fit", "materiality", "source_grounding"],
    description:
      "A case summary combining a structured overview table with an executive narrative. The table provides at-a-glance reference (taxpayers, case type, liability, collection stage). The narrative tells the case story in 3-4 paragraphs: who these people are, what happened, where things stand, and the path forward. Must read like a briefing from a sharp colleague, not a form. Specific dollar amounts, dates, and document citations required. No filler.",
  },
  form_narrative: {
    taskType: "form_narrative",
    displayName: "IRS Form Narrative",
    maxTokens: 2000,
    minTokens: 100,
    requiresSourceGrounding: true,
    allowsInference: false,
    formattingStandard: "form_field",
    criticalCriteria: ["source_grounding", "formatting_cleanliness", "task_fit"],
    description:
      "Narrative text for an IRS form field (e.g., Form 656 Section 9). Must tell the taxpayer's story as flowing prose — no headers, no bullets, no formatting. Professional and factual but human. Every dollar amount and date must trace to source material. Should convince the IRS examiner through specific facts connected to legal standards, not through rhetoric or pleading.",
  },
  client_letter: {
    taskType: "client_letter",
    displayName: "Client Letter",
    maxTokens: 2000,
    minTokens: 300,
    requiresSourceGrounding: true,
    allowsInference: true,
    formattingStandard: "prose",
    criticalCriteria: ["task_fit", "formatting_cleanliness"],
    description:
      "A professional letter — either to a client or the IRS. Client letters should be clear and accessible, explaining what's happening and what they need to do. IRS letters (penalty abatement, CDP requests) should be factual, authoritative, and well-cited. Both must have a clear ask, specific supporting facts, and zero formatting artifacts. Should sound like it came from a tax professional, not a template engine.",
  },
  internal_memo: {
    taskType: "internal_memo",
    displayName: "Internal Memo",
    maxTokens: 3000,
    minTokens: 300,
    requiresSourceGrounding: true,
    allowsInference: true,
    formattingStandard: "prose",
    criticalCriteria: ["source_grounding", "materiality"],
    description:
      "An internal analysis memo for the practitioner or team. Must lead with the key finding, not procedure. Analysis should use narrative prose with tables for data. Must clearly distinguish facts from conclusions. Should be thorough but not redundant — skip empty sections rather than writing 'no issues identified.' Risks stated directly, not hedged.",
  },
  case_memo: {
    taskType: "case_memo",
    displayName: "Case Memo",
    maxTokens: 4000,
    minTokens: 500,
    requiresSourceGrounding: true,
    allowsInference: true,
    formattingStandard: "structured",
    criticalCriteria: ["source_grounding", "task_fit", "materiality"],
    description:
      "An internal case memorandum for the case file. Must open with a punchy executive overview, tell the case story in narrative prose, present financial data in tables with analytical commentary, argue a resolution recommendation with specific legal authority, and close with prioritized action items. Should read like it was written by a senior associate who actually understands the case, not a form generator. Every claim sourced. No bullet-point dumps where prose is expected.",
  },
  transcript_analysis: {
    taskType: "transcript_analysis",
    displayName: "Transcript Analysis",
    maxTokens: 2000,
    minTokens: 200,
    requiresSourceGrounding: true,
    allowsInference: true,
    formattingStandard: "structured",
    criticalCriteria: ["source_grounding", "materiality"],
    description:
      "Analysis of an IRS account transcript. Must accurately decode transaction codes, identify the current account status, flag critical dates and balances, and recommend next actions. Every figure must match the transcript exactly.",
  },
  deadline_calculation: {
    taskType: "deadline_calculation",
    displayName: "Deadline Calculation",
    maxTokens: 500,
    minTokens: 50,
    requiresSourceGrounding: true,
    allowsInference: false,
    formattingStandard: "structured",
    criticalCriteria: ["source_grounding", "task_fit"],
    description:
      "Calculation of a legal or procedural deadline. Must cite the specific rule or code section, show the calculation, and state the deadline date clearly. Zero tolerance for arithmetic errors or unsupported date claims.",
  },
  resolution_recommendation: {
    taskType: "resolution_recommendation",
    displayName: "Resolution Recommendation",
    maxTokens: 2500,
    minTokens: 300,
    requiresSourceGrounding: true,
    allowsInference: true,
    formattingStandard: "prose",
    criticalCriteria: ["source_grounding", "task_fit", "materiality"],
    description:
      "A recommendation for a tax resolution path (OIC, IA, CNC, penalty abatement, etc.). Must be grounded in the taxpayer's specific financial data and account status. Must explain why the recommended path is appropriate and what alternatives were considered. Conclusions must follow from the data.",
  },
  general: {
    taskType: "general",
    displayName: "General Output",
    maxTokens: 2000,
    minTokens: 50,
    requiresSourceGrounding: false,
    allowsInference: true,
    formattingStandard: "prose",
    criticalCriteria: ["task_fit", "formatting_cleanliness"],
    description:
      "General AI-generated content that does not fit a specific category. Should be well-written, on-topic, and free of formatting artifacts.",
  },
}
