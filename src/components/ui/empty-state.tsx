import Link from "next/link"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  actionOnClick?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref, actionOnClick }: EmptyStateProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-c-gray-100 bg-c-snow/50 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-c-gray-100">
        <Icon className="h-6 w-6 text-c-gray-300" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-c-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-c-gray-500">{description}</p>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="rounded-lg bg-c-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-c-gray-700 transition-colors">
          {actionLabel}
        </Link>
      )}
      {actionLabel && actionOnClick && !actionHref && (
        <button onClick={actionOnClick} className="rounded-lg bg-c-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-c-gray-700 transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
