import { requireAuth } from "@/lib/auth/session"
import { WorkProductControls } from "@/components/settings/work-product-controls"

export const metadata = { title: "Work Product Controls | Cleared" }

export default async function WorkProductPage() {
  await requireAuth()
  return <div className="page-enter"><WorkProductControls /></div>
}
