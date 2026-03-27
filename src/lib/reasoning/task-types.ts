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
      "A concise summary of the case posture for a practitioner. Must include ONLY what materially matters: current liability, resolution status, key dates, and recommended next steps. Must NOT include exhaustive filing history, redundant details, or information the practitioner would not act on.",
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
      "Narrative text for an IRS form field. Must be factual, cite specific figures from source documents, use plain professional language appropriate for IRS submission, and contain zero formatting artifacts. Every dollar amount and date must trace to source material.",
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
      "A letter to a client explaining their tax situation, options, or required actions. Must be clear, avoid jargon where possible, and maintain a professional but accessible tone. Should explain what the practitioner is doing and why, and what the client needs to do.",
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
      "An internal analysis memo for the practitioner or team. Can include analysis and reasoned conclusions, but must clearly distinguish between facts from source material and analytical conclusions. Should be thorough but not redundant.",
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
      "A detailed case memorandum covering facts, analysis, and recommendations. Must be well-organized with clear sections. Every factual claim must trace to source material. Analytical conclusions must be clearly labeled as such and must follow logically from stated facts.",
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
