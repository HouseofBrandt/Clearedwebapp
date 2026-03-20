"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

interface ErrorData {
  id: string
  route: string
  method: string
  errorMessage: string
  errorStack?: string | null
  statusCode?: number | null
  userId?: string | null
  user?: { name: string } | null
  caseId?: string | null
  aiTaskId?: string | null
  metadata?: any
  createdAt: string
}

export function ErrorLog({ errors }: { errors: ErrorData[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (errors.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">No errors recorded. Everything is running smoothly.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-[140px_160px_1fr_100px_100px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
        <div>Time</div>
        <div>Route</div>
        <div>Error</div>
        <div>User</div>
        <div>Status</div>
      </div>
      {errors.map((err) => {
        const isExpanded = expandedId === err.id
        const time = new Date(err.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })

        return (
          <div key={err.id} className="border-b last:border-b-0">
            <button
              onClick={() => setExpandedId(isExpanded ? null : err.id)}
              className="grid w-full grid-cols-[140px_160px_1fr_100px_100px] gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/30 transition-colors"
            >
              <div className="text-xs text-muted-foreground">{time}</div>
              <div className="truncate font-mono text-xs">{err.route}</div>
              <div className="flex items-center gap-1 truncate">
                {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <span className="truncate">{err.errorMessage}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{err.user?.name || "—"}</div>
              <div className="text-xs">
                {err.statusCode ? (
                  <span className={`rounded px-1.5 py-0.5 ${err.statusCode >= 500 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {err.statusCode}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </button>
            {isExpanded && (
              <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
                {err.errorStack && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Stack Trace</p>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
                      {err.errorStack}
                    </pre>
                  </div>
                )}
                {err.metadata && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Metadata</p>
                    <pre className="mt-1 rounded bg-gray-100 p-2 text-xs">
                      {JSON.stringify(err.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {err.caseId && <span>Case: {err.caseId}</span>}
                  {err.aiTaskId && <span>Task: {err.aiTaskId}</span>}
                  <span>Method: {err.method}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
