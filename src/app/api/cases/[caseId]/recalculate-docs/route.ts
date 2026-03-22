import { requireApiAuth } from "@/lib/auth/api-guard"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  await recalculateDocCompleteness(params.caseId)
  return NextResponse.json({ success: true })
}
