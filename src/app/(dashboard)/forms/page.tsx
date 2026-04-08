import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { FormBuilderHub } from "@/components/forms/form-builder-hub"

export const metadata: Metadata = { title: "Form Builder | Cleared" }

export default async function FormsPage() {
  const session = await requireAuth()

  return <div className="page-enter"><FormBuilderHub currentUser={session.user} /></div>
}
