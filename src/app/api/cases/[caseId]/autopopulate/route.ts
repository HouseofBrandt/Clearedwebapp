import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { getForm1040Fields } from "@/lib/documents/form-autopopulate"

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const taxYear = request.nextUrl.searchParams.get("taxYear")
  const targetYear = taxYear ? parseInt(taxYear) : undefined

  const result = await getForm1040Fields(params.caseId, targetYear)

  return NextResponse.json({
    fields: result.fields,
    source: result.source,
    fieldCount: result.fields.length,
  })
}
