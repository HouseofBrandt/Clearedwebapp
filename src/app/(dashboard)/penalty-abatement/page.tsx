import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { decryptCasePII } from "@/lib/encryption"
import { PenaltyAbatementClient } from "@/components/penalty/penalty-abatement"

export const metadata: Metadata = { title: "Penalty Abatement | Cleared" }

export default async function PenaltyAbatementPage() {
  const session = await requireAuth()
  const accessFilter = await caseAccessFilter(session.user.id)

  // Fetch cases that have liability periods with penalties > 0
  let cases: any[] = []
  try {
    cases = await prisma.case.findMany({
      where: {
        ...accessFilter,
        status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] },
        liabilityPeriods: {
          some: {
            penalties: { gt: 0 },
          },
        },
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
          select: { id: true, name: true, licenseType: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })
  } catch (err) {
    console.error("[PenaltyAbatement] Failed to load cases:", err)
  }

  const decrypted = cases.map(decryptCasePII)

  // Serialize for client component (Decimal -> number, Date -> string)
  const serializedCases = decrypted.map((c: any) => ({
    id: c.id,
    tabsNumber: c.tabsNumber,
    clientName: c.clientName,
    caseType: c.caseType,
    status: c.status,
    allReturnsFiled: c.intelligence?.allReturnsFiled ?? false,
    currentOnEstimates: c.intelligence?.currentOnEstimates ?? false,
    practitionerName: c.assignedPractitioner?.name ?? null,
    practitionerDesignation: c.assignedPractitioner?.licenseType ?? null,
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
  }))

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Penalty Abatement</h1>
        <p className="text-sm text-muted-foreground">
          Evaluate FTA eligibility, build reasonable cause arguments, and generate abatement letters
        </p>
      </div>
      <PenaltyAbatementClient cases={serializedCases} />
    </div>
  )
}
