/**
 * /api/work-product/[taskType]/examples
 *
 * POST   — Add an example (JSON paste or multipart file upload)
 * DELETE — Remove an example by id query param
 */

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { getRegistryEntry } from "@/lib/work-product/registry"
import { extractTextFromBuffer } from "@/lib/documents/extract"
import { z } from "zod"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { createId } from "@paralleldrive/cuid2"

interface RouteContext {
  params: Promise<{ taskType: string }>
}

const MAX_CONTENT_LENGTH = 50_000
const MAX_EXAMPLES_PER_OVERRIDE = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const UPLOAD_DIR = join(process.cwd(), "uploads", "work-product-examples")

// ── POST ─────────────────────────────────────────────────────────────────────

const createExampleSchema = z.object({
  label: z.string().min(1).max(200),
  content: z.string().min(1).max(MAX_CONTENT_LENGTH),
  isGoodExample: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
})

function detectFileType(mimeType: string, fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  if (ext === "pdf" || mimeType.includes("pdf")) return "PDF"
  if (["docx", "doc"].includes(ext) || mimeType.includes("word") || mimeType.includes("wordprocessing")) return "DOCX"
  return "TEXT"
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  // Auto-create override if it doesn't exist yet
  const override = await prisma.workProductOverride.upsert({
    where: { userId_taskType: { userId: auth.userId, taskType } },
    create: { userId: auth.userId, taskType, isEnabled: true },
    update: {},
    include: { _count: { select: { examples: true } } },
  })

  if (override._count.examples >= MAX_EXAMPLES_PER_OVERRIDE) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_EXAMPLES_PER_OVERRIDE} examples per work product type` },
      { status: 400 }
    )
  }

  const contentType = request.headers.get("content-type") || ""

  // ── File upload via multipart/form-data ──
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const label = (formData.get("label") as string) || ""
    const isGoodExample = (formData.get("isGoodExample") as string) !== "false"
    const notes = (formData.get("notes") as string) || null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileType = detectFileType(file.type, file.name)

    // Extract text from the document
    let extractedText: string
    try {
      extractedText = (await extractTextFromBuffer(buffer, fileType)).replace(/\0/g, "")
    } catch (err: any) {
      return NextResponse.json(
        { error: `Could not extract text from file: ${err.message}` },
        { status: 400 }
      )
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from this file. Try a searchable PDF or DOCX." },
        { status: 400 }
      )
    }

    // Truncate to max length
    const content = extractedText.slice(0, MAX_CONTENT_LENGTH)

    // Store original file
    const fileId = createId()
    const ext = file.name.split(".").pop() || "bin"
    const storedFileName = `${fileId}.${ext}`
    const filePath = join(UPLOAD_DIR, storedFileName)

    try {
      await mkdir(UPLOAD_DIR, { recursive: true })
      await writeFile(filePath, buffer)
    } catch (err: any) {
      console.error("[Work Product] File storage failed:", err.message)
      // Continue without storing the file — the extracted text is the important part
    }

    const exampleLabel = label || file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")

    const example = await prisma.workProductExample.create({
      data: {
        overrideId: override.id,
        label: exampleLabel.slice(0, 200),
        content,
        isGoodExample,
        notes,
        sourceFileName: file.name,
        sourceFileType: file.type,
        sourceFilePath: `/uploads/work-product-examples/${storedFileName}`,
      },
    })

    return NextResponse.json(example, { status: 201 })
  }

  // ── JSON paste (existing flow) ──
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createExampleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  const example = await prisma.workProductExample.create({
    data: {
      overrideId: override.id,
      label: data.label,
      content: data.content,
      isGoodExample: data.isGoodExample,
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(example, { status: 201 })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  const url = request.nextUrl.searchParams
  const exampleId = url.get("id")

  if (!exampleId) {
    return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 })
  }

  // Verify ownership: example -> override -> user
  const example = await prisma.workProductExample.findUnique({
    where: { id: exampleId },
    include: { override: { select: { userId: true, taskType: true } } },
  })

  if (!example) {
    return NextResponse.json({ error: "Example not found" }, { status: 404 })
  }

  if (example.override.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (example.override.taskType !== taskType) {
    return NextResponse.json({ error: "Example does not belong to this task type" }, { status: 400 })
  }

  await prisma.workProductExample.delete({
    where: { id: exampleId },
  })

  return NextResponse.json({ success: true })
}
