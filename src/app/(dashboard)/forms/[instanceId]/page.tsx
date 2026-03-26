import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { FormWizard } from "@/components/forms/form-wizard"
import { getFormSchema } from "@/lib/forms/registry"
import { getFormInstance } from "@/lib/forms/form-store"
import type { FormInstance } from "@/lib/forms/types"

export const metadata: Metadata = { title: "Form Wizard | Cleared" }

export default async function FormInstancePage({
  params,
}: {
  params: { instanceId: string }
}) {
  const session = await requireAuth()
  const { instanceId } = params

  // Load from in-memory store
  let instance: FormInstance | null = getFormInstance(instanceId)

  if (!instance) {
    // Create a stub so the wizard can render for demo purposes
    instance = {
      id: instanceId,
      formNumber: "433-A",
      caseId: "",
      status: "draft",
      values: {},
      completedSections: [],
      validationErrors: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: session.user.id || "",
      version: 1,
    }
  }

  const schema = getFormSchema(instance.formNumber)
  if (!schema) redirect("/forms")

  return <FormWizard schema={schema} instance={instance} />
}
