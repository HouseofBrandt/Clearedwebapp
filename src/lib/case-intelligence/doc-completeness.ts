import { prisma } from "@/lib/db"

interface DocRequirement {
  category: string
  label: string
  critical: boolean
  matchCount?: number
}

const REQUIRED_DOCS_BY_TYPE: Record<string, DocRequirement[]> = {
  OIC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts (all years)", critical: true },
    { category: "BANK_STATEMENT", label: "Personal Bank Statements (3 months)", critical: true, matchCount: 3 },
    { category: "BANK_STATEMENT", label: "Business Bank Statements (3 months)", critical: true, matchCount: 3 },
    { category: "PAY_STUB", label: "Pay stubs or income documentation", critical: true },
    { category: "TAX_RETURN", label: "Tax returns for all open years", critical: true },
    { category: "MORTGAGE_STATEMENT", label: "Mortgage/rent documentation", critical: true },
    { category: "INSURANCE", label: "Health insurance documentation", critical: true },
    { category: "RETIREMENT_ACCOUNT", label: "Retirement account statements", critical: true },
    { category: "VEHICLE_LOAN", label: "Vehicle loan statements", critical: false },
    { category: "STUDENT_LOAN", label: "Student loan statements", critical: false },
    { category: "UTILITY_BILL", label: "Utility bills", critical: false },
    { category: "MEETING_NOTES", label: "Client intake notes", critical: false },
  ],
  PENALTY: [
    { category: "IRS_NOTICE", label: "IRS Transcripts (penalty years + 3 prior)", critical: true },
    { category: "IRS_NOTICE", label: "IRS penalty/collection notices", critical: true },
  ],
  IA: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts", critical: true },
    { category: "BANK_STATEMENT", label: "Bank Statements (3 months)", critical: true },
    { category: "PAY_STUB", label: "Income documentation", critical: true },
  ],
  TFRP: [
    { category: "IRS_NOTICE", label: "Business transcripts (Form 941)", critical: true },
    { category: "IRS_NOTICE", label: "Letter 1153 or TFRP notice", critical: true },
  ],
  INNOCENT_SPOUSE: [
    { category: "TAX_RETURN", label: "Joint tax returns (all periods)", critical: true },
    { category: "IRS_NOTICE", label: "IRS deficiency/collection notices", critical: true },
  ],
  CDP: [
    { category: "IRS_NOTICE", label: "LT11/Letter 1058 notice", critical: true },
    { category: "IRS_NOTICE", label: "Account transcripts", critical: true },
  ],
  CNC: [
    { category: "IRS_NOTICE", label: "IRS Account Transcripts", critical: true },
    { category: "BANK_STATEMENT", label: "Bank Statements (3 months)", critical: true },
    { category: "PAY_STUB", label: "Income documentation", critical: true },
  ],
}

/**
 * Build a dynamic requirements list based on the case's type, filing status,
 * and the documents already uploaded.
 */
export async function getCaseSpecificRequirements(caseId: string): Promise<DocRequirement[]> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      caseType: true,
      filingStatus: true,
      documents: { select: { documentCategory: true } },
    },
  })

  if (!caseData) return []

  // Start with the base requirements for this case type
  const baseReqs = [
    ...(REQUIRED_DOCS_BY_TYPE[caseData.caseType] || REQUIRED_DOCS_BY_TYPE["OIC"]),
  ]

  // MFJ: add spouse-specific documents
  if (caseData.filingStatus === "MFJ") {
    baseReqs.push(
      { category: "PAY_STUB", label: "Spouse income documentation", critical: true },
      { category: "BANK_STATEMENT", label: "Spouse bank statements (3 months)", critical: true, matchCount: 3 },
    )
  }

  // TFRP: always need payroll records
  if (caseData.caseType === "TFRP") {
    const hasPayroll = baseReqs.some(r => r.category === "PAYROLL")
    if (!hasPayroll) {
      baseReqs.push(
        { category: "PAYROLL", label: "Payroll records (Form 941 periods)", critical: true },
      )
    }
  }

  // OIC with business involvement: check if any business bank statements exist
  if (caseData.caseType === "OIC") {
    const uploadedCategories = caseData.documents.map(d => d.documentCategory)
    const hasBusinessBank = uploadedCategories.filter(c => c === "BANK_STATEMENT").length > 3
    if (hasBusinessBank) {
      // Business is involved — add 433-B related docs
      baseReqs.push(
        { category: "TAX_RETURN", label: "Business tax returns (Form 1120/1065)", critical: true },
        { category: "BANK_STATEMENT", label: "Business bank statements for 433-B (6 months)", critical: true, matchCount: 6 },
        { category: "PAYROLL", label: "Business payroll records", critical: true },
      )
    }
  }

  return baseReqs
}

export async function recalculateDocCompleteness(caseId: string) {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      caseType: true,
      documents: { select: { documentCategory: true } },
    },
  })

  if (!caseData) return

  const required = await getCaseSpecificRequirements(caseId)
  const uploadedCategories = caseData.documents.map(d => d.documentCategory)

  const categoryCount: Record<string, number> = {}
  for (const cat of uploadedCategories) {
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  }

  const docsRequired = required.map(req => ({
    ...req,
    received: categoryCount[req.category]
      ? (req.matchCount ? categoryCount[req.category] >= req.matchCount : true)
      : false,
  }))

  const receivedCount = docsRequired.filter(d => d.received).length
  const completeness = docsRequired.length > 0 ? receivedCount / docsRequired.length : 0

  await prisma.caseIntelligence.upsert({
    where: { caseId },
    create: {
      caseId,
      docsRequired: docsRequired,
      docsReceivedCount: receivedCount,
      docsRequiredCount: docsRequired.length,
      docCompleteness: completeness,
    },
    update: {
      docsRequired: docsRequired,
      docsReceivedCount: receivedCount,
      docsRequiredCount: docsRequired.length,
      docCompleteness: completeness,
    },
  })
}
