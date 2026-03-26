import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFormInstance } from "@/lib/forms/form-store"
import { autoPopulateForm } from "@/lib/forms/auto-populate"

/**
 * POST /api/forms/[instanceId]/auto-populate
 *
 * Runs the auto-population engine for the given form instance.
 * Reads the case's uploaded documents, matches extracted data
 * against known field mappings, and returns suggested values
 * with confidence scores and source attribution.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Load the form instance to get caseId and formNumber
    const instance = getFormInstance(params.instanceId)
    if (!instance) {
      return NextResponse.json(
        { error: "Form instance not found" },
        { status: 404 }
      )
    }

    // Run auto-population against case documents
    const result = await autoPopulateForm(instance.caseId, instance.formNumber)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Auto-populate error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
