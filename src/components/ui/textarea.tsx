import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[10px] bg-[var(--c-snow)] px-3.5 py-2.5 text-[13.5px] text-[var(--c-gray-900)] placeholder:text-[var(--c-gray-300)] transition-all duration-150 ease-out",
          "border border-[var(--c-gray-200)]",
          "shadow-[inset_0_1px_2px_rgba(10,22,40,0.04)]",
          "focus:outline-none focus:border-[rgba(42,143,168,0.4)] focus:ring-[3px] focus:ring-[rgba(42,143,168,0.06)] focus:shadow-none focus:bg-white",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--c-gray-50)]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
