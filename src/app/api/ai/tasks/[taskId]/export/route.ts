import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { generateOICWorkbook } from "@/lib/documents/excel"
import { generateOICWorkingPapersExcel } from "@/lib/documents/oic-excel"
import { generateDocx, generateTemplateDocx } from "@/lib/documents/docx"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"

const SPREADSHEET_TASKS = ["WORKING_PAPERS"]

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const task = await prisma.aITask.findUnique({
    where: { id: params.taskId },
    include: {
      case: { select: { caseNumber: true, clientName: true } },
    },
  })

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  if (!["READY_FOR_REVIEW", "APPROVED"].includes(task.status)) {
    return NextResponse.json({ error: "Task is not ready for export" }, { status: 400 })
  }

  if (!task.detokenizedOutput) {
    return NextResponse.json(
      { error: "No detokenized output available. Re-run analysis to generate exportable output." },
      { status: 400 }
    )
  }
  const output = task.detokenizedOutput

  const format = request.nextUrl.searchParams.get("format") || "xlsx"

  // Excel export for OIC working papers
  if (format === "xlsx" && SPREADSHEET_TASKS.includes(task.taskType)) {
    let buffer: Buffer

    // Use the purpose-built OIC Excel generator with real formulas
    try {
      const parsed = JSON.parse(output)
      if (parsed._type === "oic_working_papers_v1" && parsed.merged && parsed.extracted) {
        buffer = await generateOICWorkingPapersExcel(
          parsed.extracted,
          parsed.merged,
          task.case.caseNumber,
          task.case.clientName
        )
      } else {
        throw new Error("not template format")
      }
    } catch (e: any) {
      // Legacy fallback: generic tab-based workbook
      let tabs: { name: string; columns: string[]; rows: string[][] }[]
      try {
        const parsed = JSON.parse(output)
        if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
          tabs = mergedToSpreadsheetData(parsed.merged)
        } else {
          throw new Error("not template format")
        }
      } catch {
        const parsed = parseOICOutput(output)
        tabs = oicToSpreadsheetData(parsed)
      }
      buffer = await generateOICWorkbook(tabs, task.case.caseNumber, task.case.clientName)
    }

    const filename = `${task.case.caseNumber}_OIC_Working_Papers.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  // Word doc export
  if (format === "docx") {
    let buffer: Buffer

    // Template-based tasks get structured rendering (tables, not bullet lists)
    try {
      const parsed = JSON.parse(output)
      if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
        buffer = await generateTemplateDocx(
          parsed.merged,
          task.case.caseNumber,
          task.case.clientName
        )
      } else {
        buffer = await generateDocx(output, task.case.caseNumber, task.case.clientName, task.taskType)
      }
    } catch {
      // Not JSON — use markdown rendering pipeline
      buffer = await generateDocx(output, task.case.caseNumber, task.case.clientName, task.taskType)
    }

    const filename = `${task.case.caseNumber}_${task.taskType.replace(/_/g, "_")}.docx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  // Default: plain text
  const filename = `${task.case.caseNumber}_${task.taskType}.txt`
  return new NextResponse(output, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
