export const RESOLUTION_PHASES: Record<string, {
  label: string
  description: string
  order: number
  nextPhases: string[]
}> = {
  GATHERING_DOCUMENTS: {
    label: "Gathering Documents",
    description: "Collecting client documents, IRS transcripts, and financial records",
    order: 1,
    nextPhases: ["ANALYZING"],
  },
  ANALYZING: {
    label: "Analysis in Progress",
    description: "Running AI analysis and preparing financial workups",
    order: 2,
    nextPhases: ["PREPARING_FORMS"],
  },
  PREPARING_FORMS: {
    label: "Preparing Forms",
    description: "Drafting Form 433-A/B, Form 656, letters, or other filings",
    order: 3,
    nextPhases: ["PRACTITIONER_REVIEW"],
  },
  PRACTITIONER_REVIEW: {
    label: "Practitioner Review",
    description: "Licensed practitioner reviewing all documents before filing",
    order: 4,
    nextPhases: ["FILED_WITH_IRS"],
  },
  FILED_WITH_IRS: {
    label: "Filed with IRS",
    description: "Submission sent to IRS — awaiting assignment or acknowledgment",
    order: 5,
    nextPhases: ["IRS_PROCESSING"],
  },
  IRS_PROCESSING: {
    label: "IRS Processing",
    description: "IRS is reviewing the submission",
    order: 6,
    nextPhases: ["IRS_RESPONSE_RECEIVED", "ACCEPTED"],
  },
  IRS_RESPONSE_RECEIVED: {
    label: "IRS Response Received",
    description: "IRS has responded — action required",
    order: 7,
    nextPhases: ["PREPARING_FORMS", "APPEALS", "ACCEPTED", "REJECTED"],
  },
  APPEALS: {
    label: "In Appeals",
    description: "Case is at IRS Independent Office of Appeals",
    order: 8,
    nextPhases: ["ACCEPTED", "REJECTED", "IRS_RESPONSE_RECEIVED"],
  },
  ACCEPTED: {
    label: "Accepted / Resolved",
    description: "IRS accepted the resolution — compliance period may apply",
    order: 9,
    nextPhases: ["CLOSED"],
  },
  REJECTED: {
    label: "Rejected",
    description: "IRS rejected the submission — evaluate next steps",
    order: 10,
    nextPhases: ["APPEALS", "PREPARING_FORMS", "CLOSED"],
  },
  CLOSED: {
    label: "Closed",
    description: "Case fully resolved and archived",
    order: 11,
    nextPhases: [],
  },
}

export const RESOLUTION_PHASE_LABELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(RESOLUTION_PHASES).map(([k, v]) => [k, v.label])
  )
