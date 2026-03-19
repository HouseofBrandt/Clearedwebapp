import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Cases | Cleared" }
import { prisma } from "@/lib/db"
import { CasesList } from "@/components/cases/cases-list"

export default async function CasesPage() {
  await requireAuth()

  const [cases, practitioners] = await Promise.all([
    prisma.case.findMany({
      include: {
        assignedPractitioner: { select: { id: true, name: true } },
        _count: { select: { documents: true, aiTasks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ])

  return <CasesList initialCases={cases} practitioners={practitioners} />
}
