import { getServerSession } from "next-auth"
import { authOptions } from "./options"
import { redirect } from "next/navigation"

export async function getSession() {
  return await getServerSession(authOptions)
}

export async function requireAuth() {
  const session = await getSession()
  if (!session?.user) {
    redirect("/login")
  }
  return session
}

export async function requireRole(roles: string[]) {
  const session = await requireAuth()
  const userRole = (session.user as any).role
  if (!roles.includes(userRole)) {
    redirect("/dashboard")
  }
  return session
}
