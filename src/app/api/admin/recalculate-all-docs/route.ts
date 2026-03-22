import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { NextResponse } from "next/server"

export async function POST() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const cases = await prisma.case.findMany({
    select: { id: true },
  })

  let updated = 0
  for (const c of cases) {
    try {
      await recalculateDocCompleteness(c.id)
      updated++
    } catch {}
  }

  return NextResponse.json({ total: cases.length, updated })
}
