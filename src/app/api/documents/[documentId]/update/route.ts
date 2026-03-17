import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { documentCategory } = body

    const document = await prisma.document.update({
      where: { id: params.documentId },
      data: { documentCategory },
    })

    return NextResponse.json(document)
  } catch (error) {
    console.error("Update document error:", error)
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 })
  }
}
