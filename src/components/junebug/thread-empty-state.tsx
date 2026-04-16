"use client"

/**
 * Splash screen when no thread is active (spec §7.5).
 *
 * "What can I help you work on?" in Instrument Serif, suggestion chips,
 * and an inline composer. Sending a message from here creates a new
 * thread + sends the turn in one user-visible action.
 */

import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { MessageComposer, type ComposerAttachment } from "./message-composer"

export interface ThreadEmptyStateProps {
  scopedCaseNumber?: string | null
  isCreating: boolean
  onStart: (content: string, attachments: ComposerAttachment[]) => void
  suggestions?: string[]
}

const GENERAL_SUGGESTIONS = [
  "Good morning — what needs my attention today?",
  "Any overdue deadlines across my cases?",
  "Show me the practice compliance dashboard",
  "What's in the review queue?",
]

export function ThreadEmptyState({
  scopedCaseNumber,
  isCreating,
  onStart,
  suggestions,
}: ThreadEmptyStateProps) {
  const picks = suggestions ?? GENERAL_SUGGESTIONS

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: "rgba(196,154,60,0.08)",
            border: "1px solid rgba(196,154,60,0.15)",
          }}
        >
          <JunebugIcon
            className="h-10 w-10"
            mood="happy"
            style={{ color: "var(--c-warning)" }}
          />
        </div>
        <h1
          className="mt-6 text-center text-[30px] leading-tight text-c-gray-900"
          style={{ fontFamily: "var(--font-display, Georgia), serif", fontWeight: 400 }}
        >
          What can I help you work on?
        </h1>
        {scopedCaseNumber && (
          <p
            className="mt-2 text-[11px] uppercase tracking-[0.08em] text-c-gray-500"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            Scoped to {scopedCaseNumber}
          </p>
        )}
      </div>
      <MessageComposer
        disabled={isCreating}
        isStreaming={false}
        placeholder="Ask Junebug anything…"
        onSend={onStart}
        suggestions={picks}
        onPickSuggestion={(text) => onStart(text, [])}
      />
    </div>
  )
}
