import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] border-0 px-2 py-[2px] text-[11px] font-medium leading-tight tracking-[0.02em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-c-navy-900 text-white",
        secondary: "bg-c-gray-100 text-c-gray-700",
        destructive: "bg-c-danger text-white",
        outline: "border border-c-gray-200 bg-transparent text-c-gray-700",
        danger: "bg-c-danger-soft text-c-danger",
        warning: "bg-c-warning-soft text-c-warning",
        success: "bg-c-success-soft text-c-success",
        info: "bg-c-info-soft text-c-info",
        neutral: "bg-c-gray-50 text-c-gray-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
