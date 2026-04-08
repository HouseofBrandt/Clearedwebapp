import { prisma } from "@/lib/db"
import type { FormInstance } from "./types"

/**
 * Database-backed form instance store using the Prisma FormInstance model.
 * Replaces the in-memory Map that lost data on every serverless cold start.
 */

export async function getFormInstance(id: string): Promise<FormInstance | null> {
  try {
    const row = await prisma.formInstance.findUnique({ where: { id } })
    if (!row) return null
    return {
      id: row.id,
      caseId: row.caseId,
      formNumber: row.formNumber,
      status: row.status as FormInstance["status"],
      values: typeof row.values === "string" ? JSON.parse(row.values) : (row.values as Record<string, any>) || {},
      completedSections: typeof row.completedSections === "string"
        ? JSON.parse(row.completedSections)
        : (row.completedSections as string[]) || [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
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
        completedSections: instance.completedSections as any,
        status: instance.status,
        updatedAt: new Date(),
      },
      create: {
        id: instance.id,
        caseId: instance.caseId,
        formNumber: instance.formNumber,
        status: instance.status,
        values: instance.values as any,
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
    return rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      formNumber: row.formNumber,
      status: row.status as FormInstance["status"],
      values: typeof row.values === "string" ? JSON.parse(row.values) : (row.values as Record<string, any>) || {},
      completedSections: typeof row.completedSections === "string"
        ? JSON.parse(row.completedSections)
        : (row.completedSections as string[]) || [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
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
