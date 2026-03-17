import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { parseOICOutput, oicToSpreadsheetData } from "@/lib/ai/parsers/oic-parser"

/**
 * Returns the parsed OIC working paper data as JSON
 * for the in-browser spreadsheet editor.
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

  const parsed = parseOICOutput(output)
  const tabs = oicToSpreadsheetData(parsed)

  return NextResponse.json({ tabs, rawText: output })
}
