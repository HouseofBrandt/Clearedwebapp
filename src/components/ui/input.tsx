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
          "flex h-10 w-full rounded-[10px] bg-[var(--c-snow)] px-3.5 py-2 text-[13.5px] text-[var(--c-gray-900)] placeholder:text-[var(--c-gray-300)] transition-all duration-150 ease-out",
          "border border-[var(--c-gray-200)]",
          "shadow-[inset_0_1px_2px_rgba(10,22,40,0.04)]",
          "focus:outline-none focus:border-[rgba(42,143,168,0.4)] focus:ring-[3px] focus:ring-[rgba(42,143,168,0.06)] focus:shadow-none focus:bg-white",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--c-gray-50)]",
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
