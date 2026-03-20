import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { getPresignedUploadUrl } from "@/lib/storage"
import { z } from "zod"

const presignSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1), // MIME type
  fileSize: z.number().positive(),
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// 500MB max
const MAX_FILE_SIZE = 500 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = presignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const { fileName, fileType, fileSize, title, category, description, tags } = parsed.data

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
      { status: 400 }
    )
  }

  // Create the knowledge document record in "uploading" state
  const s3Key = `knowledge/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`

  const doc = await prisma.knowledgeDocument.create({
    data: {
      title,
      description: description || undefined,
      category: category as any,
      fileName,
      fileSize,
      s3Key,
      processingStatus: "uploading",
      sourceText: "",
      tags: tags || [],
      uploadedById: auth.userId,
    },
  })

  // Generate presigned URL for direct browser upload
  const { url } = await getPresignedUploadUrl(s3Key, fileType)

  return NextResponse.json({
    documentId: doc.id,
    uploadUrl: url,
    s3Key,
  })
}
