import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFormInstance } from "@/lib/forms/form-store"
import { autoPopulateForm } from "@/lib/forms/auto-populate"

/**
 * POST /api/forms/[instanceId]/auto-populate
 *
 * Runs the multi-source auto-population engine for the given form instance.
 * Gathers data from: case record, case intelligence, liability periods,
 * existing form instances, approved AI outputs, client notes, and document text.
 * Returns suggested values with confidence scores and source attribution.
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
    const instance = await getFormInstance(params.instanceId)
    if (!instance) {
      return NextResponse.json(
        { error: "Form instance not found" },
        { status: 404 }
      )
    }

    if (!instance.caseId) {
      return NextResponse.json(
        { error: "Form instance has no associated case. Select a case first." },
        { status: 400 }
      )
    }

    // Run auto-population against all data sources
    const result = await autoPopulateForm(instance.caseId, instance.formNumber)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Auto-populate error:", error)
    return NextResponse.json(
      { error: "Auto-populate failed. Please try again." },
      { status: 500 }
    )
  }
}
