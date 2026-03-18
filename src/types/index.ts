export type CaseStatus = "INTAKE" | "ANALYSIS" | "REVIEW" | "ACTIVE" | "RESOLVED" | "CLOSED"
export type CaseType = "OIC" | "IA" | "PENALTY" | "INNOCENT_SPOUSE" | "CNC" | "TFRP" | "ERC" | "UNFILED" | "AUDIT" | "CDP" | "AMENDED" | "VOLUNTARY_DISCLOSURE" | "OTHER"
export type FilingStatus = "SINGLE" | "MFJ" | "MFS" | "HOH" | "QSS"
export type Role = "PRACTITIONER" | "SENIOR" | "ADMIN"
export type AITaskType = "WORKING_PAPERS" | "CASE_MEMO" | "PENALTY_LETTER" | "OIC_NARRATIVE" | "GENERAL_ANALYSIS" | "IA_ANALYSIS" | "CNC_ANALYSIS" | "TFRP_ANALYSIS" | "INNOCENT_SPOUSE_ANALYSIS"
export type AITaskStatus = "QUEUED" | "PROCESSING" | "READY_FOR_REVIEW" | "APPROVED" | "REJECTED"

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  INTAKE: "Intake",
  ANALYSIS: "Analysis",
  REVIEW: "Review",
  ACTIVE: "Active",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  OIC: "Offer in Compromise",
  IA: "Installment Agreement",
  PENALTY: "Penalty Abatement",
  INNOCENT_SPOUSE: "Innocent Spouse",
  CNC: "Currently Not Collectible",
  TFRP: "Trust Fund Recovery Penalty",
  ERC: "Employee Retention Credit",
  UNFILED: "Unfiled Returns",
  AUDIT: "Audit Representation",
  CDP: "Collection Due Process",
  AMENDED: "Amended Returns",
  VOLUNTARY_DISCLOSURE: "Voluntary Disclosure",
  OTHER: "Other",
}

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  IRS_NOTICE: "IRS Notice",
  BANK_STATEMENT: "Bank Statement",
  TAX_RETURN: "Tax Return",
  PAYROLL: "Payroll Records",
  MEDICAL: "Medical Records",
  MEETING_NOTES: "Meeting Notes",
  UTILITY_BILL: "Utility Bill",
  VEHICLE_LOAN: "Vehicle Loan Statement",
  STUDENT_LOAN: "Student Loan Statement",
  RETIREMENT_ACCOUNT: "Retirement Account Statement",
  MORTGAGE_STATEMENT: "Mortgage Statement",
  INSURANCE: "Insurance Document",
  PAY_STUB: "Pay Stub / W-2",
  OTHER: "Other",
}

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  SINGLE: "Single",
  MFJ: "Married Filing Jointly",
  MFS: "Married Filing Separately",
  HOH: "Head of Household",
  QSS: "Qualifying Surviving Spouse",
}
