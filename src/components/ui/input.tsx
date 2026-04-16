import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[10px] bg-[var(--c-snow)] px-3.5 py-2 text-[13.5px] text-[var(--c-gray-900)] placeholder:text-[var(--c-gray-300)] transition-[border-color,box-shadow,background-color] duration-150 ease-out",
          "border border-[var(--c-gray-200)]",
          "shadow-[inset_0_1px_2px_rgba(10,22,40,0.04)]",
          "focus:outline-none focus:border-[rgba(42,143,168,0.55)] focus:ring-[3px] focus:ring-[rgba(42,143,168,0.10)] focus:shadow-none focus:bg-white",
          // Clearer invalid state for forms with aria-invalid="true"
          "aria-[invalid=true]:border-[var(--c-danger)] aria-[invalid=true]:focus:ring-[rgba(217,48,37,0.12)]",
          // More legibly disabled — desaturated, slightly darker bg, no caret
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-[var(--c-gray-50)] disabled:text-[var(--c-gray-400)]",
          // Numeric input style — opt-in via data-numeric attribute
          "data-[numeric=true]:font-mono data-[numeric=true]:tabular-nums data-[numeric=true]:tracking-tight data-[numeric=true]:text-right",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
