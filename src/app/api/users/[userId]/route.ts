import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import bcrypt from "bcryptjs"
import { z } from "zod"

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["PRACTITIONER", "SENIOR", "ADMIN"]).optional(),
  licenseType: z.enum(["EA", "CPA", "ATTORNEY"]).optional(),
  licenseNumber: z.string().min(1).optional(),
  // Practitioner credentials + firm info — used to auto-fill the
  // representative slot on every form. Optional, free-text; the firm is
  // responsible for keeping the values accurate (CAF, PTIN, etc.).
  cafNumber:    z.string().max(20).optional().nullable(),
  ptin:         z.string().max(20).optional().nullable(),
  phone:        z.string().max(40).optional().nullable(),
  jurisdiction: z.string().max(80).optional().nullable(),
  firmName:     z.string().max(160).optional().nullable(),
  firmAddress:  z.string().max(200).optional().nullable(),
  firmCity:     z.string().max(80).optional().nullable(),
  firmState:    z.string().max(40).optional().nullable(),
  firmZip:      z.string().max(20).optional().nullable(),
  firmPhone:    z.string().max(40).optional().nullable(),
  firmFax:      z.string().max(40).optional().nullable(),
})

// Fields a user is allowed to edit on their own profile (no admin role required).
const SELF_EDITABLE_FIELDS = new Set([
  "name",
  "cafNumber",
  "ptin",
  "phone",
  "jurisdiction",
  "firmName",
  "firmAddress",
  "firmCity",
  "firmState",
  "firmZip",
  "firmPhone",
  "firmFax",
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const isAdmin = (session.user as any).role === "ADMIN"
  const isSelf = (session.user as any).id === params.userId

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Non-admin users can only update their own profile fields (no role / license type changes).
    if (!isAdmin) {
      const keys = Object.keys(parsed.data)
      const disallowed = keys.filter((k) => !SELF_EDITABLE_FIELDS.has(k))
      if (disallowed.length > 0) {
        return NextResponse.json(
          { error: `You cannot update: ${disallowed.join(", ")}` },
          { status: 403 }
        )
      }
    }

    const existing = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If changing email, check uniqueness
    if (parsed.data.email && parsed.data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: parsed.data.email } })
      if (emailTaken) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 })
      }
    }

    const { password, ...rest } = parsed.data
    const data: any = { ...rest }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12)
    }

    const user = await prisma.user.update({
      where: { id: params.userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        licenseType: true,
        licenseNumber: true,
        cafNumber: true,
        ptin: true,
        phone: true,
        jurisdiction: true,
        firmName: true,
        firmAddress: true,
        firmCity: true,
        firmState: true,
        firmZip: true,
        firmPhone: true,
        firmFax: true,
        createdAt: true,
      },
    })

    // Audit: role change vs general update
    if (rest.role && rest.role !== existing.role) {
      logAudit({
        userId: (session.user as any).id,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        metadata: { targetUserId: params.userId, oldRole: existing.role, newRole: rest.role },
        ipAddress: getClientIP(),
      })
    } else {
      logAudit({
        userId: (session.user as any).id,
        action: password ? AUDIT_ACTIONS.PASSWORD_CHANGED : AUDIT_ACTIONS.USER_UPDATED,
        metadata: { targetUserId: params.userId, fieldsChanged: Object.keys(parsed.data) },
        ipAddress: getClientIP(),
      })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("Update user error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }

  // Prevent self-deletion
  if ((session.user as any).id === params.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id: params.userId } })

    logAudit({
      userId: (session.user as any).id,
      action: AUDIT_ACTIONS.USER_DEACTIVATED,
      metadata: { targetUserId: params.userId },
      ipAddress: getClientIP(),
    })

    return NextResponse.json({ message: "User deleted" })
  } catch (error) {
    console.error("Delete user error:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
