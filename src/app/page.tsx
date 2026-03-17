import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"

export default async function Home() {
  try {
    const session = await getSession()
    if (session) {
      redirect("/dashboard")
    }
  } catch (error: any) {
    // Re-throw Next.js redirect errors (they use throw internally)
    if (error?.digest?.startsWith("NEXT_REDIRECT")) {
      throw error
    }
    // Database or auth config errors — fall through to login redirect
    console.error("Session check failed:", error?.message)
  }
  redirect("/login")
}
