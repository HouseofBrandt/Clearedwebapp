import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

// GET: list cases without tabsNumber
export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const cases = await prisma.case.findMany({
    where: { tabsNumber: null },
    select: { id: true, caseNumber: true, clientName: true, caseType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ cases, count: cases.length })
}

// PATCH: set tabsNumber on a case
const patchSchema = z.object({
  caseId: z.string().min(1),
  tabsNumber: z.string().min(1),
})

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { caseId, tabsNumber } = parsed.data

  // Check uniqueness
  const existing = await prisma.case.findUnique({ where: { tabsNumber } })
  if (existing && existing.id !== caseId) {
    return NextResponse.json(
      { error: `TABS number ${tabsNumber} is already assigned to case ${existing.caseNumber}` },
      { status: 400 }
    )
  }

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: { tabsNumber },
    select: { id: true, caseNumber: true, tabsNumber: true },
  })

  return NextResponse.json(updated)
}
