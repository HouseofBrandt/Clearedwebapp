import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const DEFAULT_PREFERENCES = {
  defaultMode: null,
  defaultSourcePriorities: null,
  defaultExcludedSources: [],
  defaultRecencyBias: 50,
  defaultAudience: "Internal case file",
  templates: null,
}

/**
 * GET /api/research/preferences
 * Return the current user's research preferences, or defaults if none saved.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const preference = await prisma.researchPreference.findUnique({
      where: { userId: auth.userId },
    })

    return NextResponse.json(preference ?? { ...DEFAULT_PREFERENCES, userId: auth.userId })
  } catch (error: any) {
    console.error("[Research Preferences] GET error:", error.message)
    return NextResponse.json(
      { error: "Failed to retrieve preferences" },
      { status: 500 }
    )
  }
}

// ─── Validation ──────────────────────────────────────────────────

const updatePreferencesSchema = z.object({
  defaultMode: z
    .enum([
      "QUICK_ANSWER",
      "ISSUE_BRIEF",
      "RESEARCH_MEMORANDUM",
      "AUTHORITY_SURVEY",
      "COUNTERARGUMENT_PREP",
    ])
    .nullable()
    .optional(),
  defaultSourcePriorities: z.array(z.string()).nullable().optional(),
  defaultExcludedSources: z.array(z.string()).optional(),
  defaultRecencyBias: z.number().int().min(0).max(100).optional(),
  defaultAudience: z.string().nullable().optional(),
  templates: z.any().nullable().optional(),
})

/**
 * PUT /api/research/preferences
 * Upsert the current user's research preferences.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = updatePreferencesSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data

    const preference = await prisma.researchPreference.upsert({
      where: { userId: auth.userId },
      create: {
        userId: auth.userId,
        defaultMode: data.defaultMode ?? null,
        defaultSourcePriorities: data.defaultSourcePriorities ?? undefined,
        defaultExcludedSources: data.defaultExcludedSources ?? [],
        defaultRecencyBias: data.defaultRecencyBias ?? 50,
        defaultAudience: data.defaultAudience ?? "Internal case file",
        templates: data.templates ?? undefined,
      },
      update: {
        ...(data.defaultMode !== undefined && { defaultMode: data.defaultMode }),
        ...(data.defaultSourcePriorities !== undefined && {
          defaultSourcePriorities: data.defaultSourcePriorities,
        }),
        ...(data.defaultExcludedSources !== undefined && {
          defaultExcludedSources: data.defaultExcludedSources,
        }),
        ...(data.defaultRecencyBias !== undefined && {
          defaultRecencyBias: data.defaultRecencyBias,
        }),
        ...(data.defaultAudience !== undefined && {
          defaultAudience: data.defaultAudience,
        }),
        ...(data.templates !== undefined && { templates: data.templates }),
      },
    })

    return NextResponse.json(preference)
  } catch (error: any) {
    console.error("[Research Preferences] PUT error:", error.message)
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    )
  }
}
