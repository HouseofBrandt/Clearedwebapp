import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { generateOICWorkbook } from "@/lib/documents/excel"
import { generateDocx } from "@/lib/documents/docx"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"

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
    let tabs: { name: string; columns: string[]; rows: string[][] }[]

    // Try new template format first
    try {
      const parsed = JSON.parse(output)
      if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
        tabs = mergedToSpreadsheetData(parsed.merged)
      } else {
        throw new Error("not template format")
      }
    } catch {
      // Legacy: parse free-text
      const parsed = parseOICOutput(output)
      tabs = oicToSpreadsheetData(parsed)
    }

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

  // Word doc export
  if (format === "docx") {
    // For template-based tasks, generate a readable text version for docx
    let docContent = output
    try {
      const parsed = JSON.parse(output)
      if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
        // Convert merged data to readable text for Word doc
        const lines: string[] = ["OIC WORKING PAPERS\n"]
        for (const tab of parsed.merged.tabs) {
          lines.push(`\n## ${tab.name}\n`)
          for (const section of tab.sections) {
            lines.push(`### ${section.title}`)
            for (const field of section.fields) {
              const val = field.value != null ? String(field.value) : "N/A"
              const flag = field.flag ? ` [${field.flag}]` : ""
              if (field.type === "currency" && typeof field.value === "number") {
                lines.push(`- ${field.label}: $${field.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}${flag}`)
              } else {
                lines.push(`- ${field.label}: ${val}${flag}`)
              }
            }
            lines.push("")
          }
        }
        if (parsed.merged.summary) {
          const s = parsed.merged.summary
          lines.push("\n## OFFER SUMMARY")
          lines.push(`- Total Tax Liability: $${s.totalLiability.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
          lines.push(`- Total Asset Equity: $${s.totalAssetEquity.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
          lines.push(`- Monthly Net Income: $${s.monthlyNetIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
          lines.push(`- RCP (Lump Sum): $${s.rcpLump.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
          lines.push(`- RCP (Periodic): $${s.rcpPeriodic.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
        }
        docContent = lines.join("\n")
      }
    } catch {
      // Use raw output as-is
    }

    const buffer = await generateDocx(
      docContent,
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
