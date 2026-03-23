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
    <div className="border-t bg-background px-6 py-3">
      <div className="max-w-4xl mx-auto">
        {isProcessing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <JunebugIcon className="h-4 w-4" animated />
            <span className="text-xs">{loadingMessage}</span>
          </div>
        ) : (
          <>
            {/* Edit history */}
            {editHistory.length > 0 && (
              <div className="mb-2 text-xs text-muted-foreground">
                {editHistory.map((edit, i) => (
                  <p key={i} className="flex items-center gap-1.5 py-0.5">
                    <span className="text-green-600">&#10003;</span>
                    {i + 1}. {edit}
                  </p>
                ))}
              </div>
            )}
            {/* Input */}
            <div className="flex items-center gap-2">
              <JunebugIcon className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <input
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => e.key === "Enter" && instruction.trim() && handleEdit()}
                placeholder="Ask Junebug to edit: &quot;Fix the RCP&quot;, &quot;Strengthen the penalty argument&quot;..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
              />
              <button
                onClick={handleEdit}
                disabled={!instruction.trim()}
                className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors shrink-0"
              >
                Go
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
