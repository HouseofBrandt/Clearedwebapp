/**
 * /api/work-product/[taskType]
 *
 * GET    — Load registry entry + user override with examples + prompt text
 * PUT    — Upsert override with zod validation
 * DELETE — Delete override (cascade deletes examples)
 * POST   — Preview: build prompt block from provided fields without saving
 */

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { loadPrompt } from "@/lib/ai/prompts"
import { getRegistryEntry } from "@/lib/work-product/registry"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ taskType: string }>
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  // Load prompt text if available
  let promptText: string | null = null
  if (entry.promptFile) {
    try {
      promptText = loadPrompt(entry.promptFile)
    } catch {
      promptText = null
    }
  }

  // Load user override with examples
  const override = await prisma.workProductOverride.findUnique({
    where: { userId_taskType: { userId: auth.userId, taskType } },
    include: { examples: true },
  })

  return NextResponse.json({
    entry,
    override,
    promptText,
  })
}

// ── PUT ──────────────────────────────────────────────────────────────────────

const upsertSchema = z.object({
  isEnabled: z.boolean().optional(),
  toneDirective: z.string().max(2000).nullable().optional(),
  structureDirective: z.string().max(2000).nullable().optional(),
  lengthDirective: z.string().max(1000).nullable().optional(),
  emphasisAreas: z.string().max(2000).nullable().optional(),
  avoidances: z.string().max(2000).nullable().optional(),
  customInstructions: z.string().max(5000).nullable().optional(),
})

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  const override = await prisma.workProductOverride.upsert({
    where: { userId_taskType: { userId: auth.userId, taskType } },
    create: {
      userId: auth.userId,
      taskType,
      isEnabled: data.isEnabled ?? true,
      toneDirective: data.toneDirective ?? null,
      structureDirective: data.structureDirective ?? null,
      lengthDirective: data.lengthDirective ?? null,
      emphasisAreas: data.emphasisAreas ?? null,
      avoidances: data.avoidances ?? null,
      customInstructions: data.customInstructions ?? null,
    },
    update: {
      ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      ...(data.toneDirective !== undefined && { toneDirective: data.toneDirective }),
      ...(data.structureDirective !== undefined && { structureDirective: data.structureDirective }),
      ...(data.lengthDirective !== undefined && { lengthDirective: data.lengthDirective }),
      ...(data.emphasisAreas !== undefined && { emphasisAreas: data.emphasisAreas }),
      ...(data.avoidances !== undefined && { avoidances: data.avoidances }),
      ...(data.customInstructions !== undefined && { customInstructions: data.customInstructions }),
    },
    include: { examples: true },
  })

  return NextResponse.json(override)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  // Delete the override (cascade deletes examples via Prisma schema)
  try {
    await prisma.workProductOverride.delete({
      where: { userId_taskType: { userId: auth.userId, taskType } },
    })
  } catch {
    // If it doesn't exist, that's fine
    return NextResponse.json({ error: "No override found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

// ── POST (Preview) ───────────────────────────────────────────────────────────

const previewSchema = z.object({
  toneDirective: z.string().nullable().optional(),
  structureDirective: z.string().nullable().optional(),
  lengthDirective: z.string().nullable().optional(),
  emphasisAreas: z.string().nullable().optional(),
  avoidances: z.string().nullable().optional(),
  customInstructions: z.string().nullable().optional(),
})

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { taskType } = await context.params

  const entry = getRegistryEntry(taskType)
  if (!entry) {
    return NextResponse.json({ error: "Unknown task type" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  // Build the prompt block without saving
  const lines: string[] = []
  lines.push("")
  lines.push("\u2550\u2550\u2550 PRACTITIONER PREFERENCES \u2550\u2550\u2550")
  lines.push("")

  if (data.toneDirective) {
    lines.push(`TONE: ${data.toneDirective}`)
    lines.push("")
  }
  if (data.structureDirective) {
    lines.push(`STRUCTURE: ${data.structureDirective}`)
    lines.push("")
  }
  if (data.lengthDirective) {
    lines.push(`LENGTH: ${data.lengthDirective}`)
    lines.push("")
  }
  if (data.emphasisAreas) {
    lines.push(`EMPHASIS AREAS: ${data.emphasisAreas}`)
    lines.push("")
  }
  if (data.avoidances) {
    lines.push(`AVOIDANCES: ${data.avoidances}`)
    lines.push("")
  }
  if (data.customInstructions) {
    lines.push(`CUSTOM INSTRUCTIONS: ${data.customInstructions}`)
    lines.push("")
  }

  lines.push("\u2550\u2550\u2550 END PRACTITIONER PREFERENCES \u2550\u2550\u2550")
  lines.push("")

  return NextResponse.json({ promptBlock: lines.join("\n") })
}
