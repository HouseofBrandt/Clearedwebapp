import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * GET /api/admin/policies
 * List all active compliance policies.
 * Accessible by any authenticated user (for the policy gate to check).
 */
export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const policies = await prisma.compliancePolicy.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        version: true,
        effectiveDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ policies })
  } catch (e: any) {
    console.error("[GET /api/admin/policies]", e.message)
    return NextResponse.json(
      { error: "Failed to fetch policies" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/policies
 * Create or update a compliance policy (ADMIN only).
 * If a policy with the same slug exists, increments the version.
 *
 * Body: { slug, title, content, effectiveDate? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { slug, title, content, effectiveDate } = body

    if (!slug || !title || !content) {
      return NextResponse.json(
        { error: "slug, title, and content are required" },
        { status: 400 }
      )
    }

    // Check if a policy with this slug already exists
    const existing = await prisma.compliancePolicy.findUnique({
      where: { slug },
    })

    let policy

    if (existing) {
      // Update the existing policy: increment version, update content
      policy = await prisma.compliancePolicy.update({
        where: { slug },
        data: {
          title,
          content,
          version: existing.version + 1,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          isActive: true,
        },
      })
    } else {
      // Create a new policy
      policy = await prisma.compliancePolicy.create({
        data: {
          slug,
          title,
          content,
          version: 1,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          createdById: auth.userId,
          isActive: true,
        },
      })
    }

    return NextResponse.json({ policy })
  } catch (e: any) {
    console.error("[POST /api/admin/policies]", e.message)
    return NextResponse.json(
      { error: "Failed to create/update policy" },
      { status: 500 }
    )
  }
}
