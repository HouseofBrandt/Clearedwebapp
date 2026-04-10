"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

/**
 * JunebugBar
 * ----------
 * A single-row "doorway" to the Junebug AI assistant. Not a chatbot widget —
 * one click opens Junebug's full interface.
 *
 * Design notes from the redesign spec:
 *   - Keep the existing JunebugIcon (do NOT replace).
 *   - 44px icon circle on the left
 *   - Name + subtitle in the center (DM Sans, weight 500 and 300)
 *   - Right arrow on the right
 *   - 0.5px border, 16px radius
 *   - On hover: border turns Cleared green, arrow colorizes
 */

interface JunebugBarProps {
  onOpen?: () => void
}

export function JunebugBar({ onOpen }: JunebugBarProps) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  function handleClick() {
    if (onOpen) {
      onOpen()
    } else {
      // Fallback: the platform opens Junebug via a URL hash other components
      // listen for. Keep it loose — any page can wire the real handler in.
      if (typeof window !== "undefined") {
        window.location.hash = "junebug-open"
        router.refresh()
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-4 px-6 py-5 dash-card mb-[48px] text-left"
      style={{
        transition: "border-color 200ms var(--ease-smooth)",
        borderColor: hovered ? "var(--c-cleared-green-soft)" : "var(--border-tertiary)",
      }}
      aria-label="Open Junebug — your AI practice assistant"
    >
      {/* Icon circle — soft green tint, keeps existing JunebugIcon */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--c-cleared-green-tint)",
        }}
      >
        <JunebugIcon
          className="h-6 w-6"
          style={{ color: "var(--c-cleared-green)" }}
          mood="idle"
        />
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: "var(--font-dm)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--c-gray-800)",
            letterSpacing: "-0.005em",
          }}
        >
          Ask Junebug
        </div>
        <div
          style={{
            fontFamily: "var(--font-dm)",
            fontSize: 12,
            fontWeight: 300,
            color: "var(--c-gray-400)",
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          Your AI colleague for cases, research, and everything in between
        </div>
      </div>

      {/* Arrow */}
      <div
        className="shrink-0"
        style={{
          color: hovered ? "var(--c-cleared-green)" : "var(--c-gray-300)",
          transform: hovered ? "translateX(2px)" : "none",
          transition: "color 200ms var(--ease-smooth), transform 200ms var(--ease-smooth)",
        }}
      >
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </div>
    </button>
  )
}
