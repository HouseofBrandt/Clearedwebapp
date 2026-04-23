import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { getFormInstance } from "@/lib/forms/form-store"
import { autoPopulateForm } from "@/lib/forms/auto-populate"
import { autoPopulateV3 } from "@/lib/forms/auto-populate-v3"
import { AUTO_POPULATE_V3_ENABLED } from "@/lib/forms/feature-flags"

/**
 * POST /api/forms/[instanceId]/auto-populate
 *
 * Runs the auto-population engine for the given form instance.
 *
 * When AUTO_POPULATE_V3_ENABLED is true, uses the v3 hybrid-search engine:
 * structured sources + DocumentExtract rows + embedding-based chunk search +
 * batched AI inference. Otherwise falls back to v2 (the naive-grep engine).
 *
 * Returns suggested values with confidence scores and source attribution.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const instance = await getFormInstance(params.instanceId)
    if (!instance) {
      return NextResponse.json({ error: "Form instance not found" }, { status: 404 })
    }

    if (!instance.caseId) {
      return NextResponse.json(
        { error: "Form instance has no associated case. Select a case first." },
        { status: 400 }
      )
    }

    // V3 requires DocumentChunk rows to do semantic search. If the case
    // has no chunks yet (new case, documents still processing, or chunking
    // disabled), V3 would return empty results — worse than V2's naive
    // grep. Degrade gracefully to V2 in that case.
    if (AUTO_POPULATE_V3_ENABLED) {
      const chunkCount = await prisma.documentChunk.count({
        where: { document: { caseId: instance.caseId } },
      }).catch(() => 0)

      if (chunkCount > 0) {
        const result = await autoPopulateV3({
          caseId: instance.caseId,
          formNumber: instance.formNumber,
          formInstanceId: instance.id,
        })
        return NextResponse.json({ ...result, engine: "v3" })
      }

      // No chunks → fall back to V2 + include a hint so the UI can surface
      // that richer prefill will be available once documents are indexed.
      console.info("[auto-populate] Case has no chunks; falling back to V2", { caseId: instance.caseId })
      const result = await autoPopulateForm(instance.caseId, instance.formNumber)
      return NextResponse.json({
        ...result,
        engine: "v2-fallback",
        engineNote: "V3 semantic search is enabled but this case has no indexed document chunks yet. Re-run auto-populate after uploads finish indexing for higher-quality prefill.",
      })
    }

    const result = await autoPopulateForm(instance.caseId, instance.formNumber)
    return NextResponse.json({ ...result, engine: "v2" })
  } catch (error) {
    console.error("Auto-populate error:", error)
    return NextResponse.json(
      { error: "Auto-populate failed. Please try again." },
      { status: 500 }
    )
  }
}
