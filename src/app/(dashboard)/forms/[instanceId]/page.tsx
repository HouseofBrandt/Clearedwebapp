import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { FormWizard } from "@/components/forms/form-wizard"
import { getFormSchema } from "@/lib/forms/registry"
import type { FormInstance } from "@/lib/forms/types"

export const metadata: Metadata = { title: "Form Wizard | Cleared" }

export default async function FormInstancePage({
  params,
}: {
  params: { instanceId: string }
}) {
  const session = await requireAuth()

  const { instanceId } = params

  // Attempt to load the instance from the file-based store.
  // In a full implementation this would use Prisma or read from the API.
  let instance: FormInstance | null = null
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const filePath = path.join(process.cwd(), "data", "form-instances", `${instanceId}.json`)
    const raw = await fs.readFile(filePath, "utf-8")
    instance = JSON.parse(raw) as FormInstance
  } catch {
    // If file doesn't exist, create a stub so the wizard can render
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
