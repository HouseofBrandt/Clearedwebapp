"use client"

import { useState, useRef, useEffect } from "react"
import { Briefcase, Paperclip, Loader2 } from "lucide-react"

/**
 * DashboardComposer
 * -----------------
 * The editorial composer for the redesigned dashboard. Lighter than the
 * full feed-composer (no task mode, no multi-mode pill switching) — this is
 * the team's primary input surface and needs to feel INVITING, not utilitarian.
 *
 * States:
 *   1. Collapsed — avatar + soft placeholder + two pill buttons (Case, File)
 *   2. Expanded — textarea fills out, case chip can be removed, Post button appears
 *
 * The full feed composer is still available on /feed for tasks and file shares.
 * This one POSTs a plain post to /api/feed.
 */

interface DashboardComposerProps {
  currentUser: { id: string; name: string }
  cases?: { id: string; tabsNumber: string; clientName: string }[]
  onPostCreated?: () => void
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

/** One of the soft pastel avatar palettes from the design spec. */
function paletteForName(name: string): { bg: string; fg: string } {
  const palettes: { bg: string; fg: string }[] = [
    { bg: "var(--c-pastel-blue-bg)", fg: "var(--c-pastel-blue-fg)" },
    { bg: "var(--c-pastel-violet-bg)", fg: "var(--c-pastel-violet-fg)" },
    { bg: "var(--c-pastel-pink-bg)", fg: "var(--c-pastel-pink-fg)" },
    { bg: "var(--c-pastel-amber-bg)", fg: "var(--c-pastel-amber-fg)" },
    { bg: "var(--c-pastel-green-bg)", fg: "var(--c-pastel-green-fg)" },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palettes[hash % palettes.length]
}

export function DashboardComposer({ currentUser, cases = [], onPostCreated }: DashboardComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState("")
  const [caseId, setCaseId] = useState<string>("")
  const [sending, setSending] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showCasePicker, setShowCasePicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const casePickerRef = useRef<HTMLDivElement>(null)

  const palette = paletteForName(currentUser.name)
  const initials = getInitials(currentUser.name)
  const selectedCase = caseId ? cases.find((c) => c.id === caseId) : null

  // Auto-focus on expand
  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [expanded])

  // Close case picker on outside click
  useEffect(() => {
    if (!showCasePicker) return
    function onClick(e: MouseEvent) {
      if (casePickerRef.current && !casePickerRef.current.contains(e.target as Node)) {
        setShowCasePicker(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [showCasePicker])

  async function handleSubmit() {
    if (!content.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postType: "post",
          content: content.trim(),
          caseId: caseId || undefined,
        }),
      })
      if (res.ok) {
        setContent("")
        setCaseId("")
        setExpanded(false)
        onPostCreated?.()
      }
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      if (!content.trim()) setExpanded(false)
    }
  }

  return (
    <div
      className="dash-card mb-[40px]"
      style={{
        borderColor: hovered || expanded ? "var(--border-secondary)" : "var(--border-tertiary)",
        padding: "20px 24px",
        transition: "border-color 200ms var(--ease-smooth)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex gap-4">
        {/* Avatar */}
        <div
          className="flex items-center justify-center shrink-0 mt-0.5"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: palette.bg,
            color: palette.fg,
            fontFamily: "var(--font-dm)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.03em",
          }}
          aria-hidden="true"
        >
          {initials}
        </div>

        {/* Input column */}
        <div className="flex-1 min-w-0">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full text-left block py-2"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 15,
                fontWeight: 300,
                color: "var(--c-gray-300)",
                letterSpacing: "0.005em",
              }}
            >
              Share an update, post a question, or tag a case&hellip;
            </button>
          ) : (
            <div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Share an update, post a question, or tag a case…"
                rows={Math.max(3, Math.min(8, content.split("\n").length + 1))}
                className="w-full resize-none outline-none bg-transparent"
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 15,
                  fontWeight: 300,
                  lineHeight: 1.7,
                  letterSpacing: "0.005em",
                  color: "var(--c-gray-800)",
                }}
              />
              {/* Selected case chip */}
              {selectedCase && (
                <div
                  className="inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-full"
                  style={{
                    background: "var(--c-cleared-green-tint)",
                    color: "var(--c-cleared-green)",
                    fontFamily: "var(--font-dm)",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.03em",
                  }}
                >
                  <Briefcase className="h-3 w-3" strokeWidth={1.75} />
                  <span className="font-mono">{selectedCase.tabsNumber}</span>
                  <button
                    type="button"
                    onClick={() => setCaseId("")}
                    className="hover:opacity-60"
                    aria-label="Remove case tag"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bottom row */}
          <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: expanded ? "0.5px solid var(--border-tertiary)" : "none" }}>
            <div className="flex items-center gap-2 relative">
              {/* Case pill */}
              <div className="relative" ref={casePickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCasePicker((v) => !v)
                    if (!expanded) setExpanded(true)
                  }}
                  className="flex items-center gap-1.5 rounded-full transition-colors"
                  style={{
                    padding: "5px 12px",
                    background: "transparent",
                    border: "0.5px solid var(--border-tertiary)",
                    fontFamily: "var(--font-dm)",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--c-gray-400)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-secondary)"; e.currentTarget.style.color = "var(--c-gray-700)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-tertiary)"; e.currentTarget.style.color = "var(--c-gray-400)" }}
                >
                  <Briefcase className="h-3 w-3" strokeWidth={1.75} />
                  Case
                </button>
                {showCasePicker && cases.length > 0 && (
                  <div
                    className="absolute left-0 bottom-full mb-2 z-10 overflow-hidden"
                    style={{
                      background: "var(--c-white)",
                      border: "0.5px solid var(--border-secondary)",
                      borderRadius: 12,
                      boxShadow: "var(--shadow-panel)",
                      width: 280,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {cases.slice(0, 20).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCaseId(c.id)
                          setShowCasePicker(false)
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--c-snow)]"
                      >
                        <span className="truncate" style={{ fontFamily: "var(--font-dm)", fontSize: 12, fontWeight: 400, color: "var(--c-gray-700)" }}>
                          {c.clientName}
                        </span>
                        <span className="font-mono shrink-0 ml-3" style={{ fontSize: 10, color: "var(--c-gray-400)" }}>
                          {c.tabsNumber}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* File pill — disabled, opens full composer for now */}
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 rounded-full"
                style={{
                  padding: "5px 12px",
                  background: "transparent",
                  border: "0.5px solid var(--border-tertiary)",
                  fontFamily: "var(--font-dm)",
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--c-gray-300)",
                  cursor: "not-allowed",
                }}
                aria-label="File attachment (use the full feed for now)"
                title="File sharing lives in the full feed view"
              >
                <Paperclip className="h-3 w-3" strokeWidth={1.75} />
                File
              </button>
            </div>

            {expanded && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContent("")
                    setCaseId("")
                    setExpanded(false)
                  }}
                  className="transition-colors hover:text-[var(--c-gray-700)]"
                  style={{
                    fontFamily: "var(--font-dm)",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--c-gray-300)",
                    padding: "5px 12px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!content.trim() || sending}
                  className="flex items-center gap-1.5 rounded-full transition-opacity disabled:opacity-30"
                  style={{
                    padding: "5px 14px",
                    background: "var(--c-cleared-green)",
                    color: "var(--c-white)",
                    fontFamily: "var(--font-dm)",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
                      Posting
                    </>
                  ) : (
                    "Post"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
