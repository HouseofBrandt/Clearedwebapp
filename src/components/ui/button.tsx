import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-[13px] font-medium ring-offset-background transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "rounded-[10px] text-white shadow-[0_1px_2px_rgba(10,22,40,0.1),0_1px_1px_rgba(10,22,40,0.06),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_2px_8px_rgba(10,22,40,0.12),0_1px_1px_rgba(10,22,40,0.06)] bg-[linear-gradient(180deg,#1E3A5F_0%,#142440_100%)] hover:bg-[linear-gradient(180deg,#2B5080_0%,#1E3A5F_100%)]",
        destructive:
          "rounded-[10px] bg-[linear-gradient(180deg,#E34040_0%,#D93025_100%)] text-white shadow-[0_1px_2px_rgba(217,48,37,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_2px_8px_rgba(217,48,37,0.25)]",
        outline:
          "rounded-[10px] border border-[var(--c-gray-200)] bg-white text-[var(--c-gray-700)] shadow-[var(--shadow-xs)] hover:bg-[var(--c-gray-50)] hover:border-[var(--c-gray-300)] hover:shadow-[var(--shadow-1)]",
        secondary:
          "rounded-[10px] bg-[var(--c-gray-50)] text-[var(--c-gray-700)] border border-[var(--c-gray-100)] hover:bg-[var(--c-gray-100)] hover:border-[var(--c-gray-200)]",
        ghost:
          "rounded-[10px] text-[var(--c-gray-500)] hover:bg-[var(--c-gray-50)] hover:text-[var(--c-gray-700)]",
        teal:
          "rounded-[10px] text-[var(--c-teal)] bg-[var(--c-teal-soft)] border border-[rgba(42,143,168,0.12)] hover:bg-[rgba(42,143,168,0.1)] hover:border-[rgba(42,143,168,0.2)] hover:shadow-[0_2px_8px_rgba(42,143,168,0.08)]",
        link:
          "text-[var(--c-teal)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "px-[18px] py-[9px]",
        sm: "h-8 rounded-[8px] px-3 text-[12px]",
        lg: "h-11 rounded-[10px] px-8 text-[14px]",
        icon: "h-9 w-9 rounded-[9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
