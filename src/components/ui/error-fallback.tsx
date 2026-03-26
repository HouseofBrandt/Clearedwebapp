"use client"

import { AlertTriangle } from "lucide-react"

export function ErrorFallback({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-c-danger-soft">
        <AlertTriangle className="h-8 w-8 text-c-danger" />
      </div>
      <div>
        <h2 className="text-lg font-medium text-c-gray-900">Something went wrong</h2>
        <p className="mt-1 text-sm text-c-gray-500">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-c-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-c-gray-900 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
