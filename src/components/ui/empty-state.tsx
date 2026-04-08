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
    <div
      className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl p-10 text-center relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, var(--c-snow) 0%, var(--c-white) 100%)",
        border: "1px dashed var(--c-gray-200)",
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          width: "260px", height: "260px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(42,143,168,0.06) 0%, transparent 70%)",
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: "linear-gradient(135deg, var(--c-white), var(--c-gray-50))",
          border: "1px solid var(--c-gray-100)",
          boxShadow: "var(--shadow-1), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <Icon className="h-6 w-6" style={{ color: "var(--c-gray-300)" }} />
      </div>
      <div className="relative z-10">
        <h3 className="text-[14px]" style={{ fontWeight: 600, color: "var(--c-gray-900)", letterSpacing: "-0.01em" }}>{title}</h3>
        <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed" style={{ color: "var(--c-gray-400)" }}>{description}</p>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="relative z-10 inline-flex items-center rounded-[10px] px-5 py-2 text-[13px] text-white transition-all duration-150 hover:shadow-lg active:scale-[0.97]"
          style={{ fontWeight: 500, background: "linear-gradient(180deg, #1E3A5F 0%, #142440 100%)", boxShadow: "0 1px 2px rgba(10,22,40,0.1), 0 1px 1px rgba(10,22,40,0.06), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && actionOnClick && !actionHref && (
        <button onClick={actionOnClick} className="relative z-10 inline-flex items-center rounded-[10px] px-5 py-2 text-[13px] text-white transition-all duration-150 hover:shadow-lg active:scale-[0.97]"
          style={{ fontWeight: 500, background: "linear-gradient(180deg, #1E3A5F 0%, #142440 100%)", boxShadow: "0 1px 2px rgba(10,22,40,0.1), 0 1px 1px rgba(10,22,40,0.06), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
