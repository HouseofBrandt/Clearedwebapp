import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { encryptCasePII } from "@/lib/encryption"

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const cases = await prisma.case.findMany({
    select: { id: true, clientName: true, clientEmail: true, clientPhone: true },
  })

  let encrypted = 0
  for (const c of cases) {
    // Skip already-encrypted fields (they contain ":" from the hex format)
    const isEncrypted = c.clientName && c.clientName.split(":").length === 3 && c.clientName.length > 50
    if (isEncrypted) continue

    await prisma.case.update({
      where: { id: c.id },
      data: encryptCasePII({
        clientName: c.clientName,
        clientEmail: c.clientEmail,
        clientPhone: c.clientPhone,
      }),
    })
    encrypted++
  }

  return NextResponse.json({ encrypted, total: cases.length })
}
