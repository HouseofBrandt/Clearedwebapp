import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { decryptCasePII } from "@/lib/encryption"
import { ComplianceGapClient } from "@/components/compliance/compliance-gap-client"

export const metadata: Metadata = { title: "Compliance Gap Closer | Cleared" }

export default async function ComplianceGapPage() {
  const session = await requireAuth()
  const accessFilter = await caseAccessFilter((session.user as any).id)

  const cases = await prisma.case.findMany({
    where: {
      ...accessFilter,
      status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] },
    },
    include: {
      liabilityPeriods: {
        orderBy: { taxYear: "asc" },
      },
      intelligence: {
        select: {
          allReturnsFiled: true,
          currentOnEstimates: true,
        },
      },
      assignedPractitioner: {
        select: { name: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const decrypted = cases.map(decryptCasePII)

  // Serialize for client component (Decimal -> number, Date -> string)
  const serializedCases = decrypted.map((c: any) => ({
    id: c.id,
    tabsNumber: c.tabsNumber,
    clientName: c.clientName,
    caseType: c.caseType,
    status: c.status,
    allReturnsFiled: c.intelligence?.allReturnsFiled ?? false,
    liabilityPeriods: c.liabilityPeriods.map((lp: any) => ({
      id: lp.id,
      taxYear: lp.taxYear,
      formType: lp.formType,
      originalAssessment: lp.originalAssessment ? Number(lp.originalAssessment) : null,
      penalties: lp.penalties ? Number(lp.penalties) : null,
      interest: lp.interest ? Number(lp.interest) : null,
      totalBalance: lp.totalBalance ? Number(lp.totalBalance) : null,
      assessmentDate: lp.assessmentDate ? lp.assessmentDate.toISOString() : null,
      csedDate: lp.csedDate ? lp.csedDate.toISOString() : null,
      status: lp.status,
    })),
    practitionerName: c.assignedPractitioner?.name ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance Gap Closer</h1>
        <p className="text-sm text-muted-foreground">
          Identify unfiled years, SFR assessments, and close compliance gaps
        </p>
      </div>
      <ComplianceGapClient cases={serializedCases} />
    </div>
  )
}
