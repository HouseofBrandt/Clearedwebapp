import { decryptField } from "@/lib/encryption"

/**
 * Decrypt `case.clientName` on a shape like `{ case: { clientName: string } }`.
 * Many API routes `select` clientName from the Case record and return it to
 * the client; the field is stored encrypted at rest via `encryptField`, so
 * every response path MUST decrypt before shipping.
 *
 * This is the defense against the class of leak where an encrypted envelope
 * (`v1:iv:tag:ciphertext`) reaches the browser and renders raw inside a
 * feed card, task chip, or thread preview.
 *
 * On decrypt failure (corrupted envelope, missing key, legacy plaintext),
 * we blank the field instead of leaking the envelope. Render code should
 * fall back to `tabsNumber` or a generic label.
 *
 * Usage:
 *
 *   const tasks = await prisma.task.findMany({ include: { case: { select: { id: true, tabsNumber: true, clientName: true } } } })
 *   return NextResponse.json({ tasks: tasks.map(decryptEmbeddedCaseClientName) })
 */
export function decryptEmbeddedCaseClientName<T extends { case?: { clientName?: string | null } | null } | null | undefined>(row: T): T {
  if (!row || !row.case || !row.case.clientName) return row
  let next: string
  try {
    next = decryptField(row.case.clientName) || ""
  } catch {
    // Never ship an envelope to the client — blank it. Render code should
    // have a tabsNumber fallback.
    next = ""
  }
  return { ...row, case: { ...row.case, clientName: next } } as T
}

/**
 * Array variant — maps each row through `decryptEmbeddedCaseClientName`.
 */
export function decryptEmbeddedCaseClientNames<T extends { case?: { clientName?: string | null } | null }>(rows: T[]): T[] {
  return rows.map(decryptEmbeddedCaseClientName) as T[]
}
