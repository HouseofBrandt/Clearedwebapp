import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { uploadToS3 } from "@/lib/storage"

/**
 * POST /api/feed/upload — upload a file attachment for a feed post
 * Returns the file URL and metadata to include in the post's attachments array.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    // Limit to 25MB
    const MAX_SIZE = 25 * 1024 * 1024
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 })
    }

    const uniqueName = `${Date.now()}-${file.name}`
    const s3Key = `feed-attachments/${auth.userId}/${uniqueName}`

    await uploadToS3(s3Key, buffer, file.type || "application/octet-stream")

    return NextResponse.json({
      fileName: file.name,
      fileUrl: s3Key,
      fileType: file.type,
      fileSize: buffer.length,
    })
  } catch (error: any) {
    console.error("[Feed] Upload failed:", error.message)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
