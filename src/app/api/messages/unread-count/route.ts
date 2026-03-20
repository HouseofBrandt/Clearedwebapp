import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const count = await prisma.message.count({
    where: {
      recipientId: auth.userId,
      read: false,
      archived: false,
    },
  })

  return NextResponse.json({ count })
}
