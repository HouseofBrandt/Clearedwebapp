import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { ClearedRCC } from "@/components/rcc/cleared-rcc"

export const metadata: Metadata = { title: "Return Compliance Calculator | Cleared" }

export default async function RCCPage() {
  await requireAuth()

  return <ClearedRCC />
}
