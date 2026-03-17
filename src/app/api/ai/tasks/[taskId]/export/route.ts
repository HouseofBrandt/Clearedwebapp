import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { generateOICWorkbook } from "@/lib/documents/excel"

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

  if (format === "xlsx" && (task.taskType === "WORKING_PAPERS" || task.taskType === "OIC_NARRATIVE")) {
    // Parse OIC output and generate Excel
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

  // Default: export as plain text
  const filename = `${task.case.caseNumber}_${task.taskType}.txt`
  return new NextResponse(output, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
