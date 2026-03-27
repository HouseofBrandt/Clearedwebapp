import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getAutoMapping, clearAutoMapCache } from "@/lib/forms/pdf-auto-mapper"

/**
 * GET /api/forms/auto-map?form=433-A&refresh=true
 *
 * Diagnostic endpoint that triggers AI-powered auto-mapping for a form
 * and returns the mapping result. Useful for:
 * - Inspecting what the AI mapped for a given form
 * - Debugging mapping issues
 * - Forcing a refresh of cached mappings
 *
 * Query params:
 *   form    - Form number (e.g., "433-A", "12153", "911"). Defaults to "433-A".
 *   refresh - Set to "true" to clear the cache and re-run the mapping.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const formNumber = url.searchParams.get("form") || "433-A"
  const refresh = url.searchParams.get("refresh") === "true"

  if (refresh) {
    clearAutoMapCache(formNumber)
  }

  try {
    const result = await getAutoMapping(formNumber)

    if (!result) {
      return NextResponse.json(
        {
          error: "Could not auto-map this form",
          formNumber,
          hint: "Check that the form has a registered schema and a PDF file in public/forms/",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...result,
      mappedCount: Object.keys(result.mappings).length,
      unmappedCount: result.unmapped.length,
      cached: !refresh,
    })
  } catch (error: any) {
    console.error(`[AUTO-MAP API] Error for ${formNumber}:`, error)
    return NextResponse.json(
      { error: "Auto-mapping failed", details: error.message },
      { status: 500 }
    )
  }
}
