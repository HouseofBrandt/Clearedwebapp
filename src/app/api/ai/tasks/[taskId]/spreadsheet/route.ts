import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"

/**
 * Returns the parsed OIC working paper data as JSON
 * for the in-browser spreadsheet editor.
 *
 * Supports both:
 * - New template+extraction format (JSON with _type field)
 * - Legacy free-text format (parsed with oic-parser)
 */
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
  })

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  const output = task.detokenizedOutput || task.tokenizedOutput || ""
  if (!output) {
    return NextResponse.json({ error: "No output to parse" }, { status: 400 })
  }

  // Try new template format first
  try {
    const parsed = JSON.parse(output)
    if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
      return NextResponse.json({
        tabs: mergedToSpreadsheetData(parsed.merged),
        rawText: output,
        validationIssues: parsed.merged.validationIssues || [],
        summary: parsed.merged.summary || {},
      })
    }
  } catch {
    // Not JSON — fall through to legacy parser
  }

  // Legacy: parse free-text output
  const parsed = parseOICOutput(output)
  const tabs = oicToSpreadsheetData(parsed)

  return NextResponse.json({ tabs, rawText: output })
}
