import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { caseAccessFilter } from "@/lib/auth/case-access"

export const metadata: Metadata = { title: "Cases | Cleared" }
import { prisma } from "@/lib/db"
import { decryptCasePII } from "@/lib/encryption"
import { CasesList } from "@/components/cases/cases-list"

export default async function CasesPage() {
  const session = await requireAuth()
  const userId = (session.user as any).id
  const accessFilter = await caseAccessFilter(userId)

  const [cases, totalCount, practitioners] = await Promise.all([
    prisma.case.findMany({
      where: accessFilter,
      include: {
        assignedPractitioner: { select: { id: true, name: true } },
        _count: { select: { documents: true, aiTasks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.case.count({ where: accessFilter }),
    prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ])

  return <div className="page-enter"><CasesList initialCases={cases.map(decryptCasePII)} practitioners={practitioners} totalCount={totalCount} /></div>
}
