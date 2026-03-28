/**
 * /api/work-product/[taskType]/examples
 *
 * POST   — Add an example (auto-creates override if needed)
 * DELETE — Remove an example by id query param
 */

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { getRegistryEntry } from "@/lib/work-product/registry"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ taskType: string }>
}

const MAX_CONTENT_LENGTH = 50_000
const MAX_EXAMPLES_PER_OVERRIDE = 10

// ── POST ─────────────────────────────────────────────────────────────────────

const createExampleSchema = z.object({
  label: z.string().min(1).max(200),
  content: z.string().min(1).max(MAX_CONTENT_LENGTH),
  isGoodExample: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
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

  const parsed = createExampleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  // Auto-create override if it doesn't exist yet
  const override = await prisma.workProductOverride.upsert({
    where: { userId_taskType: { userId: auth.userId, taskType } },
    create: {
      userId: auth.userId,
      taskType,
      isEnabled: true,
    },
    update: {},
    include: { _count: { select: { examples: true } } },
  })

  // Enforce example count limit
  if (override._count.examples >= MAX_EXAMPLES_PER_OVERRIDE) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_EXAMPLES_PER_OVERRIDE} examples per work product type` },
      { status: 400 }
    )
  }

  const example = await prisma.workProductExample.create({
    data: {
      overrideId: override.id,
      label: data.label,
      content: data.content,
      isGoodExample: data.isGoodExample,
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(example, { status: 201 })
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

  const url = request.nextUrl.searchParams
  const exampleId = url.get("id")

  if (!exampleId) {
    return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 })
  }

  // Verify ownership: example -> override -> user
  const example = await prisma.workProductExample.findUnique({
    where: { id: exampleId },
    include: { override: { select: { userId: true, taskType: true } } },
  })

  if (!example) {
    return NextResponse.json({ error: "Example not found" }, { status: 404 })
  }

  if (example.override.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (example.override.taskType !== taskType) {
    return NextResponse.json({ error: "Example does not belong to this task type" }, { status: 400 })
  }

  await prisma.workProductExample.delete({
    where: { id: exampleId },
  })

  return NextResponse.json({ success: true })
}
