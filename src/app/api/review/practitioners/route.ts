import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * Returns a list of practitioners (PRACTITIONER, SENIOR, ADMIN) for the
 * review reassignment dialog. Only accessible by SENIOR and ADMIN roles.
 */
export async function GET() {
  const auth = await requireApiAuth(["ADMIN", "SENIOR"])
  if (!auth.authorized) {
    return auth.response
  }

  const practitioners = await prisma.user.findMany({
    where: {
      role: { in: ["PRACTITIONER", "SENIOR", "ADMIN"] },
    },
    select: {
      id: true,
      name: true,
      role: true,
      licenseType: true,
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(practitioners)
}
