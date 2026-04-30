import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { FormWizard } from "@/components/forms/form-wizard"
import { getFormSchema } from "@/lib/forms/registry"
import { getFormInstance } from "@/lib/forms/form-store"

export const metadata: Metadata = { title: "Form Wizard | Cleared" }

export default async function FormInstancePage({
  params,
}: {
  params: { instanceId: string }
}) {
  const session = await requireAuth()
  const { instanceId } = params

  // Load from database
  const instance = await getFormInstance(instanceId)

  if (!instance) {
    // No stub creation — redirect to form list if instance doesn't exist
    redirect("/forms")
  }

  const schema = await getFormSchema(instance.formNumber)
  if (!schema) redirect("/forms")

  // Check practitioner-profile completeness so the wizard can nudge the user
  // to fill Settings → Profile when the form has a representative slot
  // (2848, 12153, 911) and credentials are missing.
  const userId = (session.user as any).id
  const userProfile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      cafNumber: true,
      ptin: true,
      jurisdiction: true,
      licenseNumber: true,
      firmAddress: true,
      firmCity: true,
      firmState: true,
      firmZip: true,
    },
  }).catch(() => null)
  const practitionerProfileComplete = Boolean(
    userProfile &&
      userProfile.cafNumber &&
      (userProfile.ptin || userProfile.licenseNumber) &&
      userProfile.firmAddress &&
      userProfile.firmCity &&
      userProfile.firmState &&
      userProfile.firmZip
  )

  return (
    <div className="page-enter">
      <FormWizard
        schema={schema}
        instance={instance}
        practitionerProfileComplete={practitionerProfileComplete}
      />
    </div>
  )
}
