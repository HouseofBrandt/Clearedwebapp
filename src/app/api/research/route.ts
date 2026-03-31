import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { conductResearch } from "@/lib/research/web-research"
import { z } from "zod"

const VALID_KB_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const

const researchSchema = z.object({
  topic: z.string().min(1),
  context: z.string().optional(),
  scope: z.enum(["narrow", "broad"]),
  saveToKB: z.boolean().optional(),
  kbCategory: z.enum(VALID_KB_CATEGORIES).optional(),
  kbTags: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const parsed = researchSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "), details: parsed.error.flatten() }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  try {
    const result = await conductResearch({
      ...parsed.data,
      userId: auth.userId,
    })

    return Response.json(result)
  } catch (error: any) {
    console.error("[Research] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message || "Research failed" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}
