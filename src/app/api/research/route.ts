import { NextRequest } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { conductResearch } from "@/lib/research/web-research"
import { z } from "zod"

const researchSchema = z.object({
  topic: z.string().min(1),
  context: z.string().optional(),
  scope: z.enum(["narrow", "broad"]),
  saveToKB: z.boolean().optional(),
  kbCategory: z.string().optional(),
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
    return new Response(JSON.stringify({ error: parsed.error.issues.map((i) => i.message).join(", ") }), { status: 400, headers: { "Content-Type": "application/json" } })
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
