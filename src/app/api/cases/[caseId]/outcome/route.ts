import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, getClientIP } from "@/lib/ai/audit"
import { z } from "zod"

const outcomeSchema = z.object({
  outcomeType: z.enum(["ACCEPTED", "REJECTED", "SETTLED", "WITHDRAWN", "EXPIRED"]),
  outcomeAmount: z.number().optional().nullable(),
  outcomeDate: z.string().optional().nullable(),
  outcomeNotes: z.string().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasAccess = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const intelligence = await prisma.caseIntelligence.findUnique({
      where: { caseId: params.caseId },
      select: { outcomeType: true, outcomeAmount: true, outcomeDate: true, outcomeNotes: true },
    })
    return NextResponse.json({ outcome: intelligence || null })
  } catch {
    return NextResponse.json({ outcome: null })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasAccess = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = outcomeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { outcomeType, outcomeAmount, outcomeDate, outcomeNotes } = parsed.data
    const parsedDate = outcomeDate ? new Date(outcomeDate) : null

    // Upsert the case intelligence record with outcome data
    await prisma.caseIntelligence.upsert({
      where: { caseId: params.caseId },
      update: {
        outcomeType,
        outcomeAmount: outcomeAmount ?? null,
        outcomeDate: parsedDate,
        outcomeNotes: outcomeNotes ?? null,
      },
      create: {
        caseId: params.caseId,
        outcomeType,
        outcomeAmount: outcomeAmount ?? null,
        outcomeDate: parsedDate,
        outcomeNotes: outcomeNotes ?? null,
      },
    })

    // Update KnowledgeDocuments linked to this case's approved AI tasks
    const outcomeTag = buildOutcomeTag(params.caseId, outcomeType)
    try {
      await prisma.$executeRaw`
        UPDATE "knowledge_documents"
        SET "outcomeTag" = ${outcomeTag},
            "outcomeAmount" = ${outcomeAmount ?? null}::decimal,
            "updatedAt" = NOW()
        WHERE "sourceCaseId" = ${params.caseId}
      `
    } catch {
      // KD update is best-effort
    }

    // Audit log
    logAudit({
      userId: (session.user as any).id,
      action: "CASE_OUTCOME_RECORDED",
      caseId: params.caseId,
      metadata: { outcomeType, outcomeAmount, outcomeDate },
      ipAddress: getClientIP(),
    })

    return NextResponse.json({
      success: true,
      outcome: { outcomeType, outcomeAmount, outcomeDate: parsedDate, outcomeNotes },
    })
  } catch (error) {
    console.error("Outcome save error:", error)
    return NextResponse.json({ error: "Failed to save outcome" }, { status: 500 })
  }
}

/**
 * Builds an outcome tag string like "OIC_ACCEPTED", "IA_SETTLED" etc.
 * Falls back to just the outcomeType if case type isn't available.
 */
async function buildOutcomeTag(caseId: string, outcomeType: string): Promise<string> {
  try {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      select: { caseType: true },
    })
    if (caseData?.caseType) {
      return `${caseData.caseType}_${outcomeType}`
    }
  } catch {}
  return outcomeType
}
