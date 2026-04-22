"use client"

/**
 * Splash screen when no thread is active (spec §7.5 + polish spec §8).
 *
 * Polish:
 *   - Junebug icon at 96px with ambient twitch + radial glow (§8.1)
 *   - Headline + Cormorant italic subtitle (§8.2)
 *   - 2×2 prompt grid with teal-soft hover + 2px rise (§8.3)
 *   - Time-of-day-aware prompt rotation: morning prompts are about
 *     attention; afternoon about finishing; evening about recap.
 */

import { useMemo } from "react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { MessageComposer, type ComposerAttachment } from "./message-composer"
import { useFullFetch } from "@/components/assistant/full-fetch-context"

export interface ThreadEmptyStateProps {
  scopedCaseNumber?: string | null
  isCreating: boolean
  onStart: (content: string, attachments: ComposerAttachment[]) => void
  suggestions?: string[]
}

// A pool of ~12 prompts. We pick 4 based on the local hour — morning
// surfaces "what's on my plate"; afternoon surfaces "help me finish X";
// evening surfaces recap prompts. This is a cheap personalization signal
// that makes the product feel aware (polish spec §8.3).
const PROMPT_POOL = {
  morning: [
    "Good morning — what needs my attention today?",
    "Any overdue deadlines across my cases?",
    "Show me my review queue",
    "Which cases moved status overnight?",
  ],
  afternoon: [
    "Help me draft a penalty-abatement letter",
    "What's blocking my active cases?",
    "Any transcripts still pending?",
    "Walk me through the OIC eligibility for Smith",
  ],
  evening: [
    "What did I finish today?",
    "What did I move forward on this week?",
    "Summarize the practice compliance dashboard",
    "Anything I should follow up on tomorrow?",
  ],
}

function pickPrompts(): string[] {
  if (typeof window === "undefined") return PROMPT_POOL.morning
  const h = new Date().getHours()
  if (h < 11) return PROMPT_POOL.morning
  if (h < 17) return PROMPT_POOL.afternoon
  return PROMPT_POOL.evening
}

export function ThreadEmptyState({
  scopedCaseNumber,
  isCreating,
  onStart,
  suggestions,
}: ThreadEmptyStateProps) {
  const picks = useMemo(() => suggestions ?? pickPrompts(), [suggestions])
  const { armed } = useFullFetch()

  // When Full Fetch is armed, the splash reframes (polish spec §9.1 Stage 5).
  const headline = armed
    ? <>Full Fetch engaged.</>
    : "What can I help you work on?"
  const subtitle = armed
    ? "What can I help you unlock?"
    : "I can pull your cases, search your docs, and draft work product."

  return (
    <div className="flex h-full flex-col">
      <div className="polish-junebug-splash flex-1">
        <div className="polish-junebug-icon-wrap" aria-hidden="true">
          {armed && <span className="ff-icon-halo" />}
          <JunebugIcon
            className="h-16 w-16"
            mood="happy"
            style={{ color: "var(--c-warning)" }}
          />
        </div>

        <div className="flex flex-col items-center">
          <h1 className="polish-junebug-headline">
            {typeof headline === "string" ? headline : <em style={{ fontStyle: "italic", fontWeight: 500 }}>{headline}</em>}
          </h1>
          <p className="polish-junebug-subtitle">
            {armed ? <em>{subtitle}</em> : subtitle}
          </p>
        </div>

        {scopedCaseNumber && (
          <p
            className="-mt-2 text-[11px] uppercase tracking-[0.1em] text-c-gray-500"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Scoped to {scopedCaseNumber}
          </p>
        )}

        {/* 2×2 prompt grid */}
        <div className="polish-junebug-prompts" role="list">
          {picks.map((prompt) => (
            <button
              key={prompt}
              type="button"
              role="listitem"
              onClick={() => onStart(prompt, [])}
              disabled={isCreating}
              className="polish-junebug-prompt"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <MessageComposer
        disabled={isCreating}
        isStreaming={false}
        placeholder="Ask Junebug anything…"
        onSend={onStart}
      />
    </div>
  )
}
