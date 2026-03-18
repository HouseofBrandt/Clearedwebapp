import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { generateOICWorkbook } from "@/lib/documents/excel"
import { generateDocx } from "@/lib/documents/docx"

const SPREADSHEET_TASKS = ["WORKING_PAPERS", "OIC_NARRATIVE"]

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

  // Only export approved or ready-for-review tasks
  if (!["READY_FOR_REVIEW", "APPROVED"].includes(task.status)) {
    return NextResponse.json({ error: "Task is not ready for export" }, { status: 400 })
  }

  const output = task.detokenizedOutput || task.tokenizedOutput || ""
  if (!output) {
    return NextResponse.json({ error: "No output to export" }, { status: 400 })
  }

  const format = request.nextUrl.searchParams.get("format") || "xlsx"

  // Excel export for OIC working papers
  if (format === "xlsx" && SPREADSHEET_TASKS.includes(task.taskType)) {
    const parsed = parseOICOutput(output)
    const tabs = oicToSpreadsheetData(parsed)
    const buffer = await generateOICWorkbook(
      tabs,
      task.case.caseNumber,
      task.case.clientName
    )

    const filename = `${task.case.caseNumber}_OIC_Working_Papers.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  // Word doc export for memos, letters, narratives, and general analysis
  if (format === "docx") {
    const buffer = await generateDocx(
      output,
      task.case.caseNumber,
      task.case.clientName,
      task.taskType
    )

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
