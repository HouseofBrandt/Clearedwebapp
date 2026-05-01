import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { canAccessCase } from "@/lib/auth/case-access"
import { RESOLUTION_PATHS } from "@/lib/forms/resolution-engine"
import { z } from "zod"

/**
 * PATCH /api/cases/[caseId]/resolution
 *
 * Update the case's resolution path (`resolutionType` on CaseIntelligence)
 * and / or the practitioner-editable case-characteristics overrides used by
 * the form-package generator.
 *
 * Body shape (all optional, at least one required):
 *   {
 *     resolutionType?: string  // one of RESOLUTION_PATHS[].id
 *     caseCharacteristics?: {
 *       hasBusiness?: boolean
 *       isSelfEmployed?: boolean
 *       isMarriedJoint?: boolean
 *       hasIdentityTheft?: boolean
 *       needsAmendedReturn?: boolean
 *       hasNoITIN?: boolean
 *       needsTranscripts?: boolean
 *       collectionActionType?: "levy" | "lien" | "both" | "none"
 *     }
 *   }
 *
 * The endpoint upserts CaseIntelligence so cases that don't have an intel
 * row yet still accept the override.
 */

const characteristicsSchema = z
  .object({
    hasBusiness:          z.boolean().optional(),
    isSelfEmployed:       z.boolean().optional(),
    isMarriedJoint:       z.boolean().optional(),
    hasIdentityTheft:     z.boolean().optional(),
    needsAmendedReturn:   z.boolean().optional(),
    hasNoITIN:            z.boolean().optional(),
    needsTranscripts:     z.boolean().optional(),
    collectionActionType: z.enum(["levy", "lien", "both", "none"]).optional(),
  })
  .strict()

const bodySchema = z
  .object({
    resolutionType:      z.string().min(1).optional(),
    caseCharacteristics: characteristicsSchema.optional(),
  })
  .refine((d) => d.resolutionType !== undefined || d.caseCharacteristics !== undefined, {
    message: "Provide at least one of: resolutionType, caseCharacteristics",
  })

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = (session.user as any).id
  const allowed = await canAccessCase(userId, params.caseId)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  // Validate resolutionType against the canonical path list when provided.
  if (parsed.data.resolutionType) {
    const valid = RESOLUTION_PATHS.some((p) => p.id === parsed.data.resolutionType)
    if (!valid) {
      return NextResponse.json(
        { error: `Unknown resolutionType: ${parsed.data.resolutionType}` },
        { status: 400 }
      )
    }
  }

  // Merge the new override on top of any existing override map. This way a
  // toggle PATCH for a single flag doesn't clobber the rest of the row.
  const existing = await prisma.caseIntelligence.findUnique({
    where: { caseId: params.caseId },
    select: { caseCharacteristics: true },
  })
  const mergedOverrides =
    parsed.data.caseCharacteristics !== undefined
      ? { ...((existing?.caseCharacteristics as Record<string, any>) || {}), ...parsed.data.caseCharacteristics }
      : undefined

  const updateData: Record<string, any> = {}
  if (parsed.data.resolutionType !== undefined) updateData.resolutionType = parsed.data.resolutionType
  if (mergedOverrides !== undefined) updateData.caseCharacteristics = mergedOverrides

  const intel = await prisma.caseIntelligence.upsert({
    where:  { caseId: params.caseId },
    update: updateData,
    create: {
      caseId: params.caseId,
      ...updateData,
    },
    select: {
      resolutionType: true,
      caseCharacteristics: true,
    },
  })

  return NextResponse.json({
    resolutionType: intel.resolutionType,
    caseCharacteristics: intel.caseCharacteristics,
  })
}
