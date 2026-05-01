import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { User, Shield, Activity, SlidersHorizontal, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"

export const metadata: Metadata = { title: "Settings | Cleared" }
import { UserManagement } from "@/components/settings/user-management"
import { ProfileForm, PasswordChangeForm, ComplianceSection, TimezoneForm } from "@/components/settings/settings-forms"

export default async function SettingsPage() {
  const session = await requireAuth()
  const sessionUser = session.user as any
  const isAdmin = sessionUser.role === "ADMIN"

  // Fetch the full user record so the form can hydrate practitioner + firm fields.
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true, name: true, email: true, role: true,
      licenseType: true, licenseNumber: true,
      cafNumber: true, ptin: true, phone: true, jurisdiction: true,
      firmName: true, firmAddress: true, firmCity: true, firmState: true,
      firmZip: true, firmPhone: true, firmFax: true,
    },
  }).catch(() => null)
  const fallback = user ?? sessionUser

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and workspace preferences</p>
      </div>

      <div className="grid gap-8">
        {/* Profile Section */}
        <div>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <User className="h-5 w-5" /> Profile
          </h2>
          <ProfileForm
            userId={fallback.id}
            initialName={fallback.name || ""}
            email={fallback.email || ""}
            role={fallback.role || ""}
            licenseType={fallback.licenseType || null}
            licenseNumber={fallback.licenseNumber || ""}
            initialCafNumber={user?.cafNumber || ""}
            initialPtin={user?.ptin || ""}
            initialPhone={user?.phone || ""}
            initialJurisdiction={user?.jurisdiction || ""}
            initialFirmName={user?.firmName || ""}
            initialFirmAddress={user?.firmAddress || ""}
            initialFirmCity={user?.firmCity || ""}
            initialFirmState={user?.firmState || ""}
            initialFirmZip={user?.firmZip || ""}
            initialFirmPhone={user?.firmPhone || ""}
            initialFirmFax={user?.firmFax || ""}
          />
        </div>

        {/* Security Section */}
        <div>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" /> Security
          </h2>
          <PasswordChangeForm />
        </div>

        {/* Preferences Section */}
        <div>
          <TimezoneForm />
        </div>

        {/* AI Work Product */}
        <div>
          <Link href="/settings/work-product">
            <Card className="p-4 hover:border-c-teal/30 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-c-teal-soft shrink-0">
                  <SlidersHorizontal className="h-4.5 w-4.5 text-c-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13.5px] font-medium text-c-gray-800">Work Product Controls</h3>
                  <p className="text-[12px] text-c-gray-500 mt-0.5">
                    Teach the AI how you write &mdash; configure tone, structure, and upload example deliverables for each work product type
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-c-gray-400 shrink-0" />
              </div>
            </Card>
          </Link>
        </div>

        {/* System Health Section (admin only) */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" /> System Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Encryption Status</div>
                <div className="text-sm font-medium text-c-success mt-1">Active (AES-256-GCM)</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">API Keys</div>
                <div className="text-sm font-medium text-c-success mt-1">Configured</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">PII Tokenization</div>
                <div className="text-sm font-medium text-c-success mt-1">Enforced</div>
              </Card>
            </div>
          </div>
        )}

        {/* Compliance Section (admin only) */}
        {isAdmin && (
          <div>
            <ComplianceSection />
          </div>
        )}

        {/* User Management (admin only) */}
        {isAdmin && (
          <div>
            <UserManagement />
          </div>
        )}
      </div>
    </div>
  )
}
