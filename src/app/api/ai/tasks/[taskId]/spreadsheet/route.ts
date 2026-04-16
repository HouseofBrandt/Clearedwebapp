import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"
import { mergeTemplateWithData, mergedToSpreadsheetData } from "@/lib/templates/oic-merge"
import { canAccessCase } from "@/lib/auth/case-access"

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

  // Verify the user can access the case this task belongs to
  const userId = (session.user as any).id
  if (!await canAccessCase(userId, task.caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const SPREADSHEET_TASKS = ["WORKING_PAPERS"]
  if (!SPREADSHEET_TASKS.includes(task.taskType)) {
    return NextResponse.json(
      { error: `Task type "${task.taskType}" does not support spreadsheet view. Use the document viewer instead.` },
      { status: 400 }
    )
  }

  if (!task.detokenizedOutput) {
    return NextResponse.json(
      { error: "No detokenized output available. Re-run analysis to generate viewable output." },
      { status: 400 }
    )
  }
  const output = decryptField(task.detokenizedOutput)

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
