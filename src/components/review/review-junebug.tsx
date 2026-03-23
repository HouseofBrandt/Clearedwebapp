"use client"

import { useState } from "react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { getJunebugMessage } from "@/lib/junebug/loading-messages"

interface ReviewJunebugProps {
  currentOutput: string
  taskType: string
  onOutputUpdated: (newOutput: string) => void
}

export function ReviewJunebug({ currentOutput, taskType, onOutputUpdated }: ReviewJunebugProps) {
  const [instruction, setInstruction] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")
  const [editHistory, setEditHistory] = useState<string[]>([])

  async function handleEdit() {
    if (!instruction.trim()) return
    setIsProcessing(true)
    setLoadingMessage(getJunebugMessage("thinking", []))

    try {
      const res = await fetch("/api/ai/review-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentOutput, instruction, taskType }),
      })

      if (res.ok) {
        const { updatedOutput } = await res.json()
        onOutputUpdated(updatedOutput)
        setEditHistory(prev => [...prev, instruction])
        setInstruction("")
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || "Edit failed. Please try again.")
      }
    } catch {
      alert("Connection failed. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="border-t">
      {/* Edit history */}
      {editHistory.length > 0 && (
        <div className="px-4 pt-2 pb-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Edits this session
          </p>
          {editHistory.map((edit, i) => (
            <p key={i} className="text-xs text-muted-foreground py-0.5">
              {i + 1}. &ldquo;{edit}&rdquo; — applied
            </p>
          ))}
        </div>
      )}

      {/* Edit bar */}
      <div className="px-4 py-3">
        {isProcessing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <JunebugIcon className="h-4 w-4" animated />
            <span className="text-xs">{loadingMessage}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <JunebugIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={e => e.key === "Enter" && instruction.trim() && handleEdit()}
              placeholder="Ask Junebug to edit: &quot;Fix the RCP&quot;, &quot;Strengthen the penalty argument&quot;..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
            <button
              onClick={handleEdit}
              disabled={!instruction.trim()}
              className="rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors"
            >
              Go
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
