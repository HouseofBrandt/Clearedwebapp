import { prisma } from "@/lib/db"

/**
 * Returns true if the user has access to the given case.
 * ADMIN and SENIOR roles have access to all cases.
 * PRACTITIONER and SUPPORT_STAFF only access cases assigned to them.
 */
export async function canAccessCase(userId: string, caseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (!user) return false
  if (user.role === "ADMIN" || user.role === "SENIOR") return true

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { assignedPractitionerId: true },
  })

  return caseRecord?.assignedPractitionerId === userId
}

/**
 * Returns a Prisma where clause that scopes queries to the user's accessible cases.
 * ADMIN and SENIOR get an empty filter (see all).
 * Others get filtered to their assigned cases.
 */
export async function caseAccessFilter(userId: string): Promise<Record<string, any>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (!user) return { id: "impossible" } // No access
  if (user.role === "ADMIN" || user.role === "SENIOR") return {} // No filter

  return { assignedPractitionerId: userId }
}
