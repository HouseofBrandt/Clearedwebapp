/**
 * Document Freshness Rules
 *
 * Defines expiration windows for each document category.
 * Value is the number of days a document remains "current" after its
 * upload/statement date. null = never expires.
 */

export const FRESHNESS_RULES: Record<string, number | null> = {
  BANK_STATEMENT: 90,
  PAY_STUB: 60,
  PAYROLL: 60,
  TAX_RETURN: null, // never expires
  IRS_NOTICE: null,
  IRS_TRANSCRIPT: 120,
  IRS_REJECTION: null,
  MEDICAL: 90,
  INSURANCE: 180,
  MORTGAGE_STATEMENT: 90,
  VEHICLE_VALUATION: 90,
  VEHICLE_LOAN: 90,
  REAL_PROPERTY: 180,
  INVESTMENT_STATEMENT: 90,
  RETIREMENT_ACCOUNT: 90,
  FORM_433: 180,
  STUDENT_LOAN: 90,
  UTILITY_BILL: 90,
  CREDIT_CARD: 90,
  MEETING_NOTES: null,
  OTHER: null,
}

export type FreshnessStatus = "current" | "expiring_soon" | "expired" | "no_expiration" | "unknown"

export function getDocumentFreshness(
  category: string,
  uploadDate: Date | string
): { status: FreshnessStatus; daysRemaining: number | null; expirationDate: Date | null } {
  const rule = FRESHNESS_RULES[category]
  if (rule === null || rule === undefined) {
    return { status: "no_expiration", daysRemaining: null, expirationDate: null }
  }

  const uploaded = new Date(uploadDate)
  const expirationDate = new Date(uploaded.getTime() + rule * 24 * 60 * 60 * 1000)
  const now = new Date()
  const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysRemaining <= 0) return { status: "expired", daysRemaining: 0, expirationDate }
  if (daysRemaining <= 14) return { status: "expiring_soon", daysRemaining, expirationDate }
  return { status: "current", daysRemaining, expirationDate }
}
