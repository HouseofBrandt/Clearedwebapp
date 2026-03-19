import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: params.documentId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      chunks: { orderBy: { chunkIndex: "asc" }, select: { id: true, chunkIndex: true, sectionHeader: true, tokenCount: true, hitCount: true } },
    },
  })

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const allowedFields = ["title", "description", "category", "tags", "isActive"]
  const data: any = {}
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key]
  }

  const doc = await prisma.knowledgeDocument.update({
    where: { id: params.documentId },
    data,
  })

  return NextResponse.json(doc)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  await prisma.knowledgeDocument.delete({ where: { id: params.documentId } })
  return NextResponse.json({ success: true })
}
