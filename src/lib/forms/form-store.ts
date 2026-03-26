import { FormInstance } from "./types"

/**
 * In-memory form instance store.
 * On Vercel serverless, filesystem writes don't persist between invocations.
 * This in-memory store works for demo/MVP. In production, use Prisma/database.
 */
const store = new Map<string, FormInstance>()

export function getFormInstance(id: string): FormInstance | null {
  return store.get(id) || null
}

export function saveFormInstance(instance: FormInstance): void {
  store.set(instance.id, instance)
}

export function listFormInstances(caseId?: string): FormInstance[] {
  const all = Array.from(store.values())
  if (caseId) {
    return all
      .filter(i => i.caseId === caseId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function deleteFormInstance(id: string): boolean {
  return store.delete(id)
}
