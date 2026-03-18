/**
 * API route authorization guard.
 *
 * Provides role-based access control for API routes.
 * SUPPORT_STAFF cannot:
 *   - Run AI analysis
 *   - Approve/reject review output
 *   - Create or manage users
 *   - Access compliance data
 * SUPPORT_STAFF can:
 *   - View cases, upload documents, view tasks
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "./options"

export type ProtectedRole = "PRACTITIONER" | "SENIOR" | "ADMIN" | "SUPPORT_STAFF"

interface AuthResult {
  authorized: true
  userId: string
  role: ProtectedRole
  email: string
  name: string
}

interface AuthError {
  authorized: false
  response: NextResponse
}

/**
 * Check authentication and optionally enforce role requirements.
 * Returns the user info if authorized, or an error response to return immediately.
 *
 * @param allowedRoles - If provided, only these roles are permitted. If omitted, any authenticated user is allowed.
 */
export async function requireApiAuth(
  allowedRoles?: ProtectedRole[]
): Promise<AuthResult | AuthError> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const user = session.user as any
  const role = user.role as ProtectedRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Forbidden: ${role} role does not have access to this resource` },
        { status: 403 }
      ),
    }
  }

  return {
    authorized: true,
    userId: user.id,
    role,
    email: user.email,
    name: user.name,
  }
}

/** Roles that can run AI analysis and approve output */
export const PRACTITIONER_ROLES: ProtectedRole[] = ["PRACTITIONER", "SENIOR", "ADMIN"]

/** Roles that can manage users and view compliance data */
export const ADMIN_ROLES: ProtectedRole[] = ["ADMIN"]
