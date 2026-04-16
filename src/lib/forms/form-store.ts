import { prisma } from "@/lib/db"
import type { FormInstance } from "./types"

/**
 * Database-backed form instance store.
 *
 * Form values are stored as JSON in the FormInstance.values column. We do NOT
 * encrypt the JSON column itself — the same row already lives behind the
 * canAccessCase guard on every API route, and IRS forms contain a mix of PII
 * (SSN) and non-PII (form numbers, periods) that's awkward to encrypt
 * field-by-field. Practitioners need to be able to query/preview values
 * server-side to render the PDF; column-level encryption would force a
 * decrypt-everything-on-every-read pattern. We accept the same trust model
 * as the existing case.notes column (also unencrypted JSON).
 *
 * Concurrency: saveFormInstance now uses optimistic locking — the caller
 * passes the version they read; if it doesn't match, the save fails with
 * VersionConflictError so the UI can prompt the user to refresh.
 */

export class VersionConflictError extends Error {
  constructor(public expected: number, public actual: number) {
    super(`Form was modified by another user (expected v${expected}, found v${actual})`)
    this.name = "VersionConflictError"
  }
}

function rowToInstance(row: any): FormInstance {
  // validationErrors is stored alongside values under a reserved key so we
  // don't need a schema migration. The reserved key is __validationErrors.
  const valuesRaw = typeof row.values === "string" ? JSON.parse(row.values) : (row.values as Record<string, any>) || {}
  const validationErrors = (valuesRaw && typeof valuesRaw.__validationErrors === "object" && valuesRaw.__validationErrors)
    ? valuesRaw.__validationErrors
    : {}
  // Field provenance (which fields were AI-filled, with confidence + source) lives here too
  const { __validationErrors, __provenance, ...userValues } = valuesRaw

  return {
    id: row.id,
    caseId: row.caseId,
    formNumber: row.formNumber,
    status: row.status as FormInstance["status"],
    values: userValues,
    completedSections: typeof row.completedSections === "string"
      ? JSON.parse(row.completedSections)
      : (row.completedSections as string[]) || [],
    validationErrors,
    createdById: row.createdById,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getFormInstance(id: string): Promise<FormInstance | null> {
  try {
    const row = await prisma.formInstance.findUnique({ where: { id } })
    if (!row) return null
    return rowToInstance(row)
  } catch (error) {
    console.error("[FormStore] getFormInstance error:", error)
    return null
  }
}

/**
 * Save a form instance. If `instance.version` is set and the row already
 * exists, we use updateMany with a version guard for optimistic locking;
 * a count of 0 means another user beat us to it.
 *
 * Returns the new version number on success.
 * Throws VersionConflictError if the version we expected didn't match.
 */
export async function saveFormInstance(
  instance: FormInstance,
  opts: { provenance?: Record<string, any> } = {}
): Promise<number> {
  try {
    // Compose the JSON blob — user values + reserved metadata keys
    const blob: Record<string, any> = { ...instance.values }
    if (instance.validationErrors && Object.keys(instance.validationErrors).length > 0) {
      blob.__validationErrors = instance.validationErrors
    }
    if (opts.provenance && Object.keys(opts.provenance).length > 0) {
      blob.__provenance = opts.provenance
    }

    const existing = await prisma.formInstance.findUnique({
      where: { id: instance.id },
      select: { version: true },
    })

    if (!existing) {
      // First save — create
      await prisma.formInstance.create({
        data: {
          id: instance.id,
          caseId: instance.caseId,
          formNumber: instance.formNumber,
          status: instance.status,
          values: blob as any,
          completedSections: instance.completedSections as any,
          createdById: instance.createdById,
          version: 1,
        },
      })
      return 1
    }

    // Optimistic lock — only update if version matches what the caller read
    const expectedVersion = instance.version || existing.version
    const result = await prisma.formInstance.updateMany({
      where: { id: instance.id, version: expectedVersion },
      data: {
        values: blob as any,
        completedSections: instance.completedSections as any,
        status: instance.status,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new VersionConflictError(expectedVersion, existing.version)
    }
    return expectedVersion + 1
  } catch (error) {
    if (error instanceof VersionConflictError) throw error
    console.error("[FormStore] saveFormInstance error:", error)
    throw error
  }
}

export async function listFormInstances(caseId?: string): Promise<FormInstance[]> {
  try {
    const rows = await prisma.formInstance.findMany({
      where: caseId ? { caseId } : undefined,
      orderBy: { updatedAt: "desc" },
    })
    return rows.map(rowToInstance)
  } catch (error) {
    console.error("[FormStore] listFormInstances error:", error)
    return []
  }
}

export async function deleteFormInstance(id: string): Promise<boolean> {
  try {
    await prisma.formInstance.delete({ where: { id } })
    return true
  } catch (error) {
    console.error("[FormStore] deleteFormInstance error:", error)
    return false
  }
}
