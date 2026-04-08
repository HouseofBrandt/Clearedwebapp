import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { readFile } from "fs/promises"
import { join } from "path"

interface RouteContext {
  params: Promise<{ taskType: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params
  const exampleId = request.nextUrl.searchParams.get("id")

  if (!exampleId) {
    return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 })
  }

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

  if (!example.sourceFilePath) {
    return NextResponse.json({ error: "No original file available" }, { status: 404 })
  }

  try {
    const absolutePath = join(process.cwd(), example.sourceFilePath)
    const buffer = await readFile(absolutePath)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": example.sourceFileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(example.sourceFileName || "download")}"`,
        "Content-Length": String(buffer.length),
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
  }
}
