import { prisma } from "@/lib/db"

/**
 * Returns true if the user has access to the given case.
 * All authenticated users can access all cases — this is a small firm
 * where every practitioner needs visibility into the full caseload.
 */
export async function canAccessCase(userId: string, caseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  // Any authenticated user can access any case
  return !!user
}

/**
 * Returns a Prisma where clause that scopes queries to the user's accessible cases.
 * All authenticated users see all cases.
 */
export async function caseAccessFilter(userId: string): Promise<Record<string, any>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (!user) return { id: "impossible" } // No access
  return {} // All users see all cases
}
