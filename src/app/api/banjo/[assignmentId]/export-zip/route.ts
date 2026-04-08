import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import JSZip from "jszip"
import { generateDocx } from "@/lib/documents/docx"
import { generateOICWorkingPapersExcel } from "@/lib/documents/oic-excel"
import { validateForExport } from "@/lib/banjo/export-validation"
import { decryptField } from "@/lib/encryption"

const SPREADSHEET_TASKS = ["WORKING_PAPERS"]

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const assignment = await prisma.banjoAssignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      case: { select: { tabsNumber: true, clientName: true } },
      tasks: {
        where: { status: "APPROVED" },
        orderBy: { banjoStepNumber: "asc" },
      },
    },
  })

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
  }

  if (assignment.tasks.length === 0) {
    return NextResponse.json({ error: "No approved deliverables to export" }, { status: 400 })
  }

  // ── Pre-export validation (C8) ─────────────────────────────────
  const skipValidation = request.nextUrl.searchParams.get("skipValidation") === "true"
  if (!skipValidation) {
    // Run structured validation via export-validation module
    const validation = validateForExport(assignment.tasks)
    if (!validation.valid) {
      return NextResponse.json({
        error: "Export blocked: deliverables failed validation",
        validation,
      }, { status: 422 })
    }

    // Additional server-side checks (decryption, content presence)
    const validationErrors: string[] = []
    for (const task of assignment.tasks) {
      const rawOutput = task.detokenizedOutput || task.tokenizedOutput
      if (!rawOutput || rawOutput.trim() === "") {
        validationErrors.push(
          `Step ${task.banjoStepNumber || "?"} "${task.banjoStepLabel || task.taskType}": Missing output content`
        )
        continue
      }
      const output = task.detokenizedOutput ? decryptField(task.detokenizedOutput) : rawOutput
      if (!output || output.trim() === "") {
        validationErrors.push(
          `Step ${task.banjoStepNumber || "?"} "${task.banjoStepLabel || task.taskType}": Output decryption produced empty content`
        )
        continue
      }
      if (SPREADSHEET_TASKS.includes(task.taskType)) {
        try {
          const parsed = JSON.parse(output)
          if (parsed._type === "oic_working_papers_v1" && (!parsed.merged || !parsed.extracted)) {
            validationErrors.push(
              `Step ${task.banjoStepNumber || "?"} "${task.banjoStepLabel || task.taskType}": Output format invalid — missing required fields (merged/extracted)`
            )
          }
        } catch {
          // Not JSON is acceptable — will fall through to docx generation
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Export validation failed", details: validationErrors },
        { status: 422 }
      )
    }
  }

  const zip = new JSZip()
  const caseName = assignment.case.tabsNumber || "case"
  const clientName = assignment.case.clientName ? decryptField(assignment.case.clientName) : ""

  for (const task of assignment.tasks) {
    const output = task.detokenizedOutput ? decryptField(task.detokenizedOutput) : ""
    const stepLabel = (task.banjoStepLabel || task.taskType).replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_")
    const fileName = `${task.banjoStepNumber || 0}_${stepLabel}`

    if (SPREADSHEET_TASKS.includes(task.taskType)) {
      try {
        const parsed = JSON.parse(output)
        if (parsed._type === "oic_working_papers_v1" && parsed.merged && parsed.extracted) {
          const buffer = await generateOICWorkingPapersExcel(
            parsed.extracted,
            parsed.merged,
            caseName,
            clientName
          )
          zip.file(`${fileName}.xlsx`, buffer)
          continue
        }
      } catch { /* fall through to docx */ }
    }

    // Generate docx for narrative outputs
    try {
      const buffer = await generateDocx(
        output,
        caseName,
        clientName,
        task.banjoStepLabel || task.taskType
      )
      zip.file(`${fileName}.docx`, buffer)
    } catch {
      // Fallback: include as text
      zip.file(`${fileName}.txt`, output)
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${caseName}_banjo_export.zip"`,
    },
  })
}
