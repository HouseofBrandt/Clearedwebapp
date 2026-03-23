"use client"

import { useState, useEffect, useRef } from "react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

interface MentionSuggestion {
  type: "user" | "junebug" | "case"
  id?: string
  display: string
  label: string
}

interface MentionAutocompleteProps {
  query: string // the text after @ or #
  triggerChar: "@" | "#"
  position: { top: number; left: number }
  onSelect: (suggestion: MentionSuggestion) => void
  onDismiss: () => void
}

export function MentionAutocomplete({
  query,
  triggerChar,
  position,
  onSelect,
  onDismiss,
}: MentionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.toLowerCase()

    if (triggerChar === "@") {
      // Always include Junebug at the top
      const results: MentionSuggestion[] = []
      if ("junebug".includes(q)) {
        results.push({ type: "junebug", display: "@Junebug", label: "Junebug" })
      }

      // Fetch users
      fetch(`/api/users?search=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => {
          const users = (data.users || data || []).map((u: any) => ({
            type: "user" as const,
            id: u.id,
            display: `@${u.name}`,
            label: u.name,
          }))
          setSuggestions([...results, ...users].slice(0, 8))
        })
        .catch(() => {
          setSuggestions(results)
        })
    } else if (triggerChar === "#") {
      // Search cases
      fetch(`/api/cases?search=${encodeURIComponent(query)}&limit=8`)
        .then((r) => r.json())
        .then((data) => {
          const cases = (data.cases || data || []).map((c: any) => ({
            type: "case" as const,
            id: c.id,
            display: `#${c.clientName || c.tabsNumber}`,
            label: `${c.clientName || ""} (${c.tabsNumber})`,
          }))
          setSuggestions(cases)
        })
        .catch(() => {
          setSuggestions([])
        })
    }

    setSelectedIndex(0)
  }, [query, triggerChar])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (suggestions.length > 0) {
          e.preventDefault()
          onSelect(suggestions[selectedIndex])
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [suggestions, selectedIndex, onSelect, onDismiss])

  // Click outside to dismiss
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onDismiss])

  if (suggestions.length === 0) return null

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[200px]"
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.type}-${s.id || s.display}`}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
            i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          }`}
          onClick={() => onSelect(s)}
        >
          {s.type === "junebug" && (
            <JunebugIcon className="h-4 w-4 text-amber-600" />
          )}
          {s.type === "user" && (
            <span className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-medium">
              {s.label.charAt(0)}
            </span>
          )}
          {s.type === "case" && (
            <span className="text-primary text-xs">#</span>
          )}
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Hook that detects when a user types @ or # in a text input and returns autocomplete state.
 */
export function useMentionDetection(text: string, cursorPos: number) {
  const [mentionState, setMentionState] = useState<{
    active: boolean
    triggerChar: "@" | "#"
    query: string
    startIndex: number
  } | null>(null)

  useEffect(() => {
    if (cursorPos === 0) {
      setMentionState(null)
      return
    }

    // Look backwards from cursor for @ or #
    const beforeCursor = text.slice(0, cursorPos)
    const atMatch = beforeCursor.match(/[@#](\w*)$/)

    if (atMatch) {
      const triggerChar = atMatch[0][0] as "@" | "#"
      const query = atMatch[1]
      const startIndex = cursorPos - atMatch[0].length
      setMentionState({ active: true, triggerChar, query, startIndex })
    } else {
      setMentionState(null)
    }
  }, [text, cursorPos])

  return mentionState
}
