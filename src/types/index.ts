export type CaseStatus = "INTAKE" | "ANALYSIS" | "REVIEW" | "ACTIVE" | "RESOLVED" | "CLOSED"
export type CaseType = "OIC" | "IA" | "PENALTY" | "INNOCENT_SPOUSE" | "CNC" | "TFRP" | "ERC" | "UNFILED" | "AUDIT" | "CDP" | "AMENDED" | "VOLUNTARY_DISCLOSURE" | "OTHER"
export type FilingStatus = "SINGLE" | "MFJ" | "MFS" | "HOH" | "QSS"
export type Role = "PRACTITIONER" | "SENIOR" | "ADMIN" | "SUPPORT_STAFF"
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

export const TASK_TYPE_LABELS: Record<AITaskType, string> = {
  WORKING_PAPERS: "OIC Working Papers",
  CASE_MEMO: "Case Memo",
  PENALTY_LETTER: "Penalty Abatement Letter",
  OIC_NARRATIVE: "OIC Narrative",
  GENERAL_ANALYSIS: "General Analysis",
  IA_ANALYSIS: "Installment Agreement Analysis",
  CNC_ANALYSIS: "Currently Not Collectible Analysis",
  TFRP_ANALYSIS: "TFRP Analysis",
  INNOCENT_SPOUSE_ANALYSIS: "Innocent Spouse Analysis",
}

export const ROLE_LABELS: Record<Role, string> = {
  PRACTITIONER: "Practitioner",
  SENIOR: "Senior Practitioner",
  ADMIN: "Administrator",
  SUPPORT_STAFF: "Support Staff",
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

export type DeadlineType = "CDP_HEARING" | "EQUIVALENT_HEARING" | "TAX_COURT_PETITION" | "CSED_EXPIRATION" | "ASSESSMENT_STATUTE" | "OIC_SUBMISSION" | "OIC_PAYMENT" | "OIC_COMPLIANCE" | "IA_PAYMENT" | "RETURN_DUE" | "EXTENSION_DUE" | "ESTIMATED_TAX" | "IRS_RESPONSE" | "DOCUMENT_REQUEST" | "POA_RENEWAL" | "FOLLOW_UP" | "HEARING_DATE" | "MEETING" | "INTERNAL_REVIEW" | "CUSTOM"
export type DeadlinePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
export type DeadlineStatus = "UPCOMING" | "DUE_SOON" | "OVERDUE" | "COMPLETED" | "WAIVED"

export const DEADLINE_TYPE_LABELS: Record<string, string> = {
  CDP_HEARING: "CDP Hearing",
  EQUIVALENT_HEARING: "Equivalent Hearing",
  TAX_COURT_PETITION: "Tax Court Petition",
  CSED_EXPIRATION: "CSED Expiration",
  ASSESSMENT_STATUTE: "Assessment Statute",
  OIC_SUBMISSION: "OIC Submission",
  OIC_PAYMENT: "OIC Payment",
  OIC_COMPLIANCE: "OIC Compliance",
  IA_PAYMENT: "IA Payment",
  RETURN_DUE: "Return Due",
  EXTENSION_DUE: "Extension Due",
  ESTIMATED_TAX: "Estimated Tax",
  IRS_RESPONSE: "IRS Response",
  DOCUMENT_REQUEST: "Document Request",
  POA_RENEWAL: "POA Renewal",
  FOLLOW_UP: "Follow Up",
  HEARING_DATE: "Hearing Date",
  MEETING: "Meeting",
  INTERNAL_REVIEW: "Internal Review",
  CUSTOM: "Custom",
}

export const DEADLINE_PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-blue-100 text-blue-800 border-blue-300",
}

export const DEADLINE_PRIORITY_DOTS: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-blue-500",
}

export const DEADLINE_DEFAULT_PRIORITY: Record<string, DeadlinePriority> = {
  CDP_HEARING: "CRITICAL",
  TAX_COURT_PETITION: "CRITICAL",
  CSED_EXPIRATION: "HIGH",
  OIC_SUBMISSION: "HIGH",
  RETURN_DUE: "HIGH",
  IRS_RESPONSE: "MEDIUM",
  DOCUMENT_REQUEST: "MEDIUM",
  IA_PAYMENT: "MEDIUM",
  ESTIMATED_TAX: "MEDIUM",
  FOLLOW_UP: "LOW",
  MEETING: "LOW",
  INTERNAL_REVIEW: "LOW",
}

export type MessageType = "DIRECT_MESSAGE" | "BUG_REPORT" | "FEATURE_REQUEST" | "DEADLINE_REMINDER" | "REVIEW_ASSIGNED" | "TASK_APPROVED" | "TASK_REJECTED" | "SYSTEM_ANNOUNCEMENT" | "CASE_NOTE"
export type MessagePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT"

export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  DIRECT_MESSAGE: "Message",
  BUG_REPORT: "Bug Report",
  FEATURE_REQUEST: "Feature Request",
  DEADLINE_REMINDER: "Deadline Reminder",
  REVIEW_ASSIGNED: "Review Ready",
  TASK_APPROVED: "Approved",
  TASK_REJECTED: "Rejected",
  SYSTEM_ANNOUNCEMENT: "Announcement",
  CASE_NOTE: "Case Note",
}

export const MESSAGE_TYPE_COLORS: Record<string, string> = {
  DIRECT_MESSAGE: "bg-blue-100 text-blue-800",
  BUG_REPORT: "bg-red-100 text-red-800",
  FEATURE_REQUEST: "bg-purple-100 text-purple-800",
  DEADLINE_REMINDER: "bg-amber-100 text-amber-800",
  REVIEW_ASSIGNED: "bg-blue-100 text-blue-800",
  TASK_APPROVED: "bg-green-100 text-green-800",
  TASK_REJECTED: "bg-red-100 text-red-700",
  SYSTEM_ANNOUNCEMENT: "bg-gray-100 text-gray-800",
  CASE_NOTE: "bg-gray-100 text-gray-700",
}

export const MESSAGE_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
}

export const DEADLINE_DEFAULT_TITLES: Record<string, string> = {
  CDP_HEARING: "CDP Hearing Request",
  TAX_COURT_PETITION: "Tax Court Petition",
  CSED_EXPIRATION: "CSED Expiration",
  OIC_SUBMISSION: "OIC Submission Target",
  OIC_PAYMENT: "OIC Payment Due",
  OIC_COMPLIANCE: "OIC Compliance Check",
  IA_PAYMENT: "IA Payment Due",
  RETURN_DUE: "Tax Return Due",
  EXTENSION_DUE: "Extension Due",
  ESTIMATED_TAX: "Estimated Tax Payment",
  IRS_RESPONSE: "IRS Response Due",
  DOCUMENT_REQUEST: "Client Documents Due",
  POA_RENEWAL: "POA Renewal",
  FOLLOW_UP: "Follow Up",
  HEARING_DATE: "Hearing Date",
  MEETING: "Client Meeting",
  INTERNAL_REVIEW: "Internal Review",
}
