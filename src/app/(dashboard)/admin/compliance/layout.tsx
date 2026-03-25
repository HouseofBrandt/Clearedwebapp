"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, AlertTriangle, FileCheck, FileBarChart } from "lucide-react"

const subNavItems = [
  { name: "Overview", href: "/admin/compliance", icon: LayoutDashboard },
  { name: "Issues", href: "/admin/compliance/issues", icon: AlertTriangle },
  { name: "Evidence", href: "/admin/compliance/evidence", icon: FileCheck },
  { name: "Reports", href: "/admin/compliance/reports", icon: FileBarChart },
]

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SOC 2 Compliance</h1>
        <p className="text-muted-foreground">
          Trust Services Criteria monitoring, evidence collection, and audit readiness
        </p>
      </div>

      <nav className="flex space-x-1 border-b">
        {subNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/compliance" &&
              pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
