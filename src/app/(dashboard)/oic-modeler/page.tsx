import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { OICModeler } from "@/components/oic/oic-modeler"

export const metadata: Metadata = { title: "OIC Modeler | Cleared" }

export default async function OICModelerPage() {
  await requireAuth()

  return <div className="page-enter"><OICModeler /></div>
}
