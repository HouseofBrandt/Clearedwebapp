import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { z } from "zod"

const VALID_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(VALID_CATEGORIES),
  sourceText: z.string().min(10, "Content must be at least 10 characters"),
  tags: z.array(z.string()).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const url = request.nextUrl.searchParams
  const category = url.get("category")
  const search = url.get("search")

  const where: any = {}
  if (category) where.category = category
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { tags: { has: search.toLowerCase() } },
    ]
  }

  const documents = await prisma.knowledgeDocument.findMany({
    where,
    include: {
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { chunks: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(documents)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: data.title,
      description: data.description,
      category: data.category as any,
      sourceText: data.sourceText,
      tags: data.tags || [],
      fileName: data.fileName,
      fileSize: data.fileSize,
      uploadedById: auth.userId,
    },
  })

  // Ingest: chunk and embed
  const result = await ingestDocument(doc.id, data.sourceText)

  return NextResponse.json(
    {
      id: doc.id,
      title: doc.title,
      chunksCreated: result.chunksCreated,
      warning: result.error,
    },
    { status: 201 }
  )
}
