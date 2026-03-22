import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { encryptField } from "@/lib/encryption"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"

function isEncrypted(value: string | null): boolean {
  if (!value) return true // null/empty doesn't need encryption
  // Encrypted values are hex format: iv_hex:authTag_hex:ciphertext_hex
  const parts = value.split(":")
  if (parts.length !== 3) return false
  // Each part should be valid hex and reasonable length
  return parts.every(p => p.length >= 16 && /^[0-9a-f]+$/i.test(p))
}

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const cases = await prisma.case.findMany({
    select: { id: true, clientName: true, clientEmail: true, clientPhone: true },
  })

  let encrypted = 0
  for (const c of cases) {
    const needsEncryption =
      (c.clientName && !isEncrypted(c.clientName)) ||
      (c.clientEmail && !isEncrypted(c.clientEmail)) ||
      (c.clientPhone && !isEncrypted(c.clientPhone))

    if (needsEncryption) {
      const encData: any = {}
      if (c.clientName && !isEncrypted(c.clientName)) {
        encData.clientName = encryptField(c.clientName)
      }
      if (c.clientEmail && !isEncrypted(c.clientEmail)) {
        encData.clientEmail = encryptField(c.clientEmail)
      }
      if (c.clientPhone && !isEncrypted(c.clientPhone)) {
        encData.clientPhone = encryptField(c.clientPhone)
      }

      await prisma.case.update({
        where: { id: c.id },
        data: encData,
      })
      encrypted++
    }
  }

  logAudit({
    userId: auth.userId,
    action: AUDIT_ACTIONS.ENCRYPTION_PERFORMED,
    metadata: { total: cases.length, encrypted },
  })

  return NextResponse.json({
    total: cases.length,
    encrypted,
    message: `Encrypted PII fields on ${encrypted} cases`,
  })
}
