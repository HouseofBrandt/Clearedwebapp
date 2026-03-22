import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { deleteFromS3 } from "@/lib/storage"
import { z } from "zod"

const bulkDeleteSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(100),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { documentIds } = parsed.data

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, filePath: true },
    })

    // Delete from storage
    await Promise.allSettled(
      documents.map((doc) => deleteFromS3(doc.filePath).catch(() => {}))
    )

    // Delete from database
    const result = await prisma.document.deleteMany({
      where: { id: { in: documents.map((d) => d.id) } },
    })

    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error("Bulk delete error:", error)
    return NextResponse.json({ error: "Failed to delete documents" }, { status: 500 })
  }
}
