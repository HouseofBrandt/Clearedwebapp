import {
  LayoutDashboard,
  FolderOpen,
  ClipboardCheck,
  Calendar,
  Settings,
  ScrollText,
  BarChart3,
  Calculator,
  Scale,
  ShieldAlert,
  TrendingUp,
  Shield,
  Network,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type NavSection = "MAIN" | "TOOLS" | "ADMIN"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  description: string
  adminOnly?: boolean
  section: NavSection
}

export const NAV_ITEMS: NavItem[] = [
  // MAIN section
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Daily brief and action queue", section: "MAIN" },
  { name: "Cases", href: "/cases", icon: FolderOpen, description: "Active matters", section: "MAIN" },
  { name: "Review Queue", href: "/review", icon: ClipboardCheck, description: "Approve AI work product", section: "MAIN" },
  { name: "Calendar", href: "/calendar", icon: Calendar, description: "Deadlines and hearings", section: "MAIN" },
  { name: "Portfolio", href: "/portfolio", icon: BarChart3, description: "Firm-wide case health", section: "MAIN" },

  // TOOLS section
  { name: "Transcript Decoder", href: "/rcc", icon: Calculator, description: "IRS transcript analysis & return estimator", section: "TOOLS" },
  { name: "OIC Modeler", href: "/oic-modeler", icon: Scale, description: "Offer in Compromise RCP modeling", section: "TOOLS" },
  { name: "Penalty Abatement", href: "/penalty-abatement", icon: ShieldAlert, description: "FTA & reasonable cause letters", section: "TOOLS" },

  // Standalone items (Settings — rendered separately)
  { name: "Settings", href: "/settings", icon: Settings, description: "Workspace preferences", section: "MAIN" },

  // ADMIN section
  { name: "SOC 2", href: "/admin/compliance", icon: Shield, description: "SOC 2 Type II compliance tracker", adminOnly: true, section: "ADMIN" },
  { name: "Audit Log", href: "/settings/audit-log", icon: ScrollText, description: "System activity log", adminOnly: true, section: "ADMIN" },
  { name: "Switchboard", href: "/admin/switchboard", icon: Network, description: "AI pipeline visibility", adminOnly: true, section: "ADMIN" },
  { name: "AI Analytics", href: "/settings/analytics", icon: TrendingUp, description: "AI quality & learning metrics", adminOnly: true, section: "ADMIN" },
]

export function getVisibleNavItems(role?: string) {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN")
}

export function getActiveNavItem(pathname: string, role?: string) {
  return getVisibleNavItems(role).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
}

export function getPageContext(pathname: string, role?: string) {
  const active = getActiveNavItem(pathname, role)
  if (active) return active
  return {
    name: "Cleared",
    href: pathname,
    icon: Shield,
    description: "Tax resolution workspace",
    section: "MAIN" as NavSection,
  }
}
