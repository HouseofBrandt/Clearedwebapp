import { prisma } from "@/lib/db"
import type { FormInstance, FieldMeta } from "./types"

/**
 * Database-backed form instance store using the Prisma FormInstance model.
 * Replaces the in-memory Map that lost data on every serverless cold start.
 */

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T } catch { return fallback }
  }
  return raw as T
}

function rowToInstance(row: any): FormInstance {
  return {
    id: row.id,
    caseId: row.caseId,
    formNumber: row.formNumber,
    status: row.status as FormInstance["status"],
    values: parseJson<Record<string, any>>(row.values, {}),
    valuesMeta: parseJson<Record<string, FieldMeta>>(row.valuesMeta, {}),
    completedSections: parseJson<string[]>(row.completedSections, []),
    validationErrors: {},
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

export async function saveFormInstance(instance: FormInstance): Promise<void> {
  try {
    await prisma.formInstance.upsert({
      where: { id: instance.id },
      update: {
        values: instance.values as any,
        valuesMeta: (instance.valuesMeta || {}) as any,
        completedSections: instance.completedSections as any,
        status: instance.status,
        version: instance.version || 1,
        updatedAt: new Date(),
      },
      create: {
        id: instance.id,
        caseId: instance.caseId,
        formNumber: instance.formNumber,
        status: instance.status,
        values: instance.values as any,
        valuesMeta: (instance.valuesMeta || {}) as any,
        completedSections: instance.completedSections as any,
        createdById: instance.createdById,
        version: instance.version || 1,
      },
    })
  } catch (error) {
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
