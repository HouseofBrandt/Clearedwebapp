export const maxDuration = 300 // 5 minutes for large document ingestion

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { extractTextFromBuffer } from "@/lib/documents/extract"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
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
  sourceText: z.string().min(10, "Content must be at least 10 characters").optional(),
  tags: z.array(z.string()).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
})

function detectFileType(mimeType: string, fileName: string, buffer: Buffer): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  const mime = (mimeType || "").toLowerCase()

  if (buffer.length > 4) {
    if (buffer.toString("ascii", 0, 5) === "%PDF-") return "PDF"
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
      if (ext === "docx" || ext === "doc" || mime.includes("wordprocessing") || mime.includes("msword")) return "DOCX"
      return "DOCX"
    }
  }

  if (ext === "pdf" || mime.includes("pdf")) return "PDF"
  if (["docx", "doc"].includes(ext) || mime.includes("word")) return "DOCX"
  if (["xlsx", "xls"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
  if (["csv"].includes(ext) || mime.includes("csv")) return "TEXT"
  if (["rtf"].includes(ext) || mime.includes("rtf")) return "TEXT"
  return "TEXT"
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const url = request.nextUrl.searchParams
  const category = url.get("category")
  const search = url.get("search")

  const where: any = {}
  if (category) {
    if (!VALID_CATEGORIES.includes(category as any)) {
      return NextResponse.json(
        { error: `Invalid category '${category}'. Valid values: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      )
    }
    where.category = category
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { tags: { has: search.toLowerCase() } },
    ]
  }

  try {
    const documents = await prisma.knowledgeDocument.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, name: true } },
        _count: { select: { chunks: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json(documents)
  } catch (error) {
    console.error("[Knowledge API] GET failed:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: "Failed to load knowledge documents." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const contentType = request.headers.get("content-type") || ""

  // Handle binary file uploads via FormData
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string
    const category = formData.get("category") as string
    const description = formData.get("description") as string | null
    const tagsRaw = formData.get("tags") as string | null

    if (!file || !title || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!VALID_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileType = detectFileType(file.type, file.name, buffer)
    // Strip null bytes — PostgreSQL text columns reject \0x00
    const sourceText = (await extractTextFromBuffer(buffer, fileType)).replace(/\0/g, "")

    if (!sourceText || sourceText.trim().length < 10) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from this file. Try uploading a searchable PDF or text file." },
        { status: 400 }
      )
    }

    let tags: string[] = []
    if (tagsRaw) {
      try { tags = JSON.parse(tagsRaw) } catch { tags = [] }
    }

    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        description: description || undefined,
        category: category as any,
        sourceText,
        tags,
        fileName: file.name,
        fileSize: buffer.length,
        uploadedById: auth.userId,
      },
    })

    const result = await ingestDocument(doc.id, sourceText)

    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.KB_DOCUMENT_UPLOADED,
      resourceId: doc.id,
      resourceType: "KnowledgeDocument",
      metadata: { title: doc.title, category },
    })

    return NextResponse.json(
      { id: doc.id, title: doc.title, chunksCreated: result.chunksCreated, warning: result.error },
      { status: 201 }
    )
  }

  // Handle JSON text uploads
  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  if (!data.sourceText) {
    return NextResponse.json(
      { error: "sourceText is required for JSON uploads. Use the presign endpoint for file uploads." },
      { status: 400 }
    )
  }

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
