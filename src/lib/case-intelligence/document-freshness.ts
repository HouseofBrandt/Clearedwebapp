import { prisma } from "@/lib/db"

/**
 * Expiration windows by document category (in days).
 * Categories not listed here have no expiration (e.g. TAX_RETURN, IRS_NOTICE, MEETING_NOTES).
 */
const EXPIRATION_WINDOWS: Record<string, number> = {
  BANK_STATEMENT: 90,
  PAY_STUB: 60,
  INVESTMENT_STATEMENT: 90,
  RETIREMENT_ACCOUNT: 90,
  VEHICLE_VALUATION: 90,
  VEHICLE_LOAN: 90,
  MORTGAGE_STATEMENT: 90,
  STUDENT_LOAN: 90,
  INSURANCE: 90,
  UTILITY_BILL: 90,
}

/**
 * Compute freshness status for a document given its statement date and category.
 */
export function computeFreshness(
  statementDate: Date,
  category: string
): { expiresAt: Date | null; freshnessStatus: string | null } {
  const windowDays = EXPIRATION_WINDOWS[category]
  if (windowDays == null) {
    return { expiresAt: null, freshnessStatus: null }
  }

  const expiresAt = new Date(statementDate.getTime() + windowDays * 24 * 60 * 60 * 1000)
  const now = new Date()
  const msUntilExpiry = expiresAt.getTime() - now.getTime()
  const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000)

  let freshnessStatus: string
  if (daysUntilExpiry <= 0) {
    freshnessStatus = "expired"
  } else if (daysUntilExpiry <= 30) {
    freshnessStatus = "expiring_soon"
  } else {
    freshnessStatus = "fresh"
  }

  return { expiresAt, freshnessStatus }
}

/**
 * Recalculate freshness for all documents in a case that have a statementDate.
 */
export async function recalculateFreshness(caseId: string) {
  const documents = await prisma.document.findMany({
    where: { caseId },
    select: {
      id: true,
      statementDate: true,
      documentCategory: true,
    },
  })

  const updates = documents
    .filter((doc) => doc.statementDate != null)
    .map((doc) => {
      const { expiresAt, freshnessStatus } = computeFreshness(
        doc.statementDate!,
        doc.documentCategory
      )
      return prisma.document.update({
        where: { id: doc.id },
        data: { expiresAt, freshnessStatus },
      })
    })

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }
}

/**
 * Get a human-readable label and color for a freshness status (for UI badges).
 */
export function getFreshnessLabel(
  status: string | null
): { label: string; color: string } {
  switch (status) {
    case "fresh":
      return { label: "Fresh", color: "green" }
    case "expiring_soon":
      return { label: "Expiring", color: "yellow" }
    case "expired":
      return { label: "Expired", color: "red" }
    default:
      return { label: "", color: "" }
  }
}
