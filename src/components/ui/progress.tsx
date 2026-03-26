"use client"

import * as React from "react"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number
  /** Optional label shown inside or beside the bar */
  label?: string
  /** Bar height variant */
  size?: "sm" | "md" | "lg"
  /** Color variant */
  variant?: "default" | "success" | "warning" | "destructive"
  /** Show percentage text */
  showPercent?: boolean
  /** Indeterminate / pulsing mode (ignores value) */
  indeterminate?: boolean
}

const sizeClasses = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
}

const variantClasses = {
  default: "bg-primary",
  success: "bg-c-success",
  warning: "bg-c-warning-soft0",
  destructive: "bg-destructive",
}

export function Progress({
  value,
  label,
  size = "md",
  variant = "default",
  showPercent = false,
  indeterminate = false,
  className = "",
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={`w-full ${className}`} {...props}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-xs text-muted-foreground truncate">{label}</span>
          )}
          {showPercent && (
            <span className="text-xs font-medium tabular-nums text-muted-foreground ml-2">
              {indeterminate ? "..." : `${Math.round(clamped)}%`}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full bg-muted rounded-full overflow-hidden ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {indeterminate ? (
          <div
            className={`h-full rounded-full ${variantClasses[variant]} animate-progress-indeterminate`}
            style={{ width: "40%" }}
          />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${variantClasses[variant]}`}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  )
}
