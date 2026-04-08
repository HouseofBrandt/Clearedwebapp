import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--c-gray-50)] text-[var(--c-gray-600)] border border-[var(--c-gray-100)]",
        secondary:
          "bg-[var(--c-gray-50)] text-[var(--c-gray-500)]",
        destructive:
          "bg-[var(--c-danger-soft)] text-[var(--c-danger)] border border-[rgba(217,48,37,0.1)]",
        outline:
          "border border-[var(--c-gray-200)] text-[var(--c-gray-600)] bg-transparent",
        success:
          "bg-[var(--c-success-soft)] text-[var(--c-success)] border border-[rgba(11,138,94,0.1)]",
        warning:
          "bg-[var(--c-warning-soft)] text-[var(--c-warning)] border border-[rgba(217,119,6,0.1)]",
        info:
          "bg-[var(--c-info-soft)] text-[var(--c-info)] border border-[rgba(42,143,168,0.1)]",
        teal:
          "bg-[var(--c-teal-soft)] text-[var(--c-teal)] border border-[rgba(42,143,168,0.12)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className="h-[5px] w-[5px] rounded-full shrink-0"
          style={{
            background: "currentColor",
            opacity: 0.7,
          }}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
