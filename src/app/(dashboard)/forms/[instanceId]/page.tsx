import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { FormWizard } from "@/components/forms/form-wizard"
import { getFormSchema } from "@/lib/forms/registry"
import { getFormInstance } from "@/lib/forms/form-store"

export const metadata: Metadata = { title: "Form Wizard | Cleared" }

export default async function FormInstancePage({
  params,
}: {
  params: { instanceId: string }
}) {
  await requireAuth()
  const { instanceId } = params

  // Load from database
  const instance = await getFormInstance(instanceId)

  if (!instance) {
    // No stub creation — redirect to form list if instance doesn't exist
    redirect("/forms")
  }

  const schema = getFormSchema(instance.formNumber)
  if (!schema) redirect("/forms")

  return <div className="page-enter"><FormWizard schema={schema} instance={instance} /></div>
}
