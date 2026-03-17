import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { CaseDetail } from "@/components/cases/case-detail"

export default async function CaseDetailPage({
  params,
}: {
  params: { caseId: string }
}) {
  await requireAuth()

  const caseData = await prisma.case.findUnique({
    where: { id: params.caseId },
    include: {
      assignedPractitioner: { select: { id: true, name: true, email: true } },
      documents: {
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { uploadedAt: "desc" },
      },
      aiTasks: {
        include: {
          reviewActions: {
            include: { practitioner: { select: { name: true } } },
            orderBy: { reviewStartedAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!caseData) {
    notFound()
  }

  const practitioners = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return <CaseDetail caseData={caseData} practitioners={practitioners} />
}
