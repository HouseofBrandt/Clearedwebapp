"use client"

/**
 * MessageComposer (spec §7.8).
 *
 *   - Autosizing textarea (max ~180px).
 *   - Enter submits, Shift+Enter inserts newline.
 *   - Send disabled when empty or a stream is in flight.
 *   - Attachment slot: file picker; displays pending files as chips.
 */

import { useEffect, useRef, useState } from "react"
import { Paperclip, Send, Sparkles, X } from "lucide-react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

const MAX_TEXTAREA_PX = 180

export interface ComposerAttachment {
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  /** Optional: if referenced from an existing case document */
  documentId?: string
}

export interface MessageComposerProps {
  disabled: boolean
  isStreaming: boolean
  placeholder?: string
  onSend: (content: string, attachments: ComposerAttachment[]) => void
  /** Suggestion chips rendered above the composer when the thread is empty. */
  suggestions?: string[]
  onPickSuggestion?: (text: string) => void
  loadingMessage?: string | null
  /**
   * Full Fetch toggle — "Jarvis" mode. When on, the next send flips
   * Junebug to claude-opus-4-7 at a 16k token ceiling and loads the
   * full live-case packet. Parent owns the state so it can persist
   * across thread switches + localStorage.
   */
  fullFetch?: boolean
  onToggleFullFetch?: () => void
}

export function MessageComposer({
  disabled,
  isStreaming,
  placeholder = "Ask Junebug anything…",
  onSend,
  suggestions,
  onPickSuggestion,
  loadingMessage,
  fullFetch = false,
  onToggleFullFetch,
}: MessageComposerProps) {
  const [value, setValue] = useState("")
  const [pending, setPending] = useState<ComposerAttachment[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Autosize on value change
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "36px"
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_PX) + "px"
  }, [value])

  const canSend = !disabled && (value.trim().length > 0 || pending.length > 0)

  const submit = () => {
    if (!canSend) return
    onSend(value.trim(), pending)
    setValue("")
    setPending([])
    // Reset height
    if (inputRef.current) inputRef.current.style.height = "36px"
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    // v1: attachments sent as informational metadata only. Actual upload to
    // storage is tracked separately (spec §6.6 note — attachments are
    // informational text in the system prompt until PR 3 wires storage).
    //
    // For now, we record name/size/type and leave fileUrl blank. The API
    // schema tolerates this (validated per-field, no URL format check).
    const next: ComposerAttachment[] = files.map((f) => ({
      fileName: f.name,
      fileUrl: "",
      fileType: f.type || "application/octet-stream",
      fileSize: f.size,
    }))
    setPending((prev) => [...prev, ...next])
    // Reset input so the same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removePending = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-3 border-t border-c-gray-100 bg-white px-6 py-4 md:px-10">
      {/* Loading hint while streaming */}
      {isStreaming && (
        <div className="flex items-center gap-2 self-start rounded-full bg-c-gray-50 px-3 py-1 text-[12px] text-c-gray-500">
          <JunebugIcon className="h-4 w-4" mood="thinking" animated />
          <span>{loadingMessage || "Junebug is thinking…"}</span>
        </div>
      )}

      {/* Suggestion chips (splash / empty state) */}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (onPickSuggestion) onPickSuggestion(s)
                else setValue(s)
              }}
              className="rounded-full border border-c-gray-100 px-3.5 py-1.5 text-[12.5px] text-c-gray-500 transition-colors hover:border-c-gray-200 hover:bg-c-gray-50 hover:text-c-gray-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Attachment chips */}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pending.map((a, idx) => (
            <div
              key={`${a.fileName}-${idx}`}
              className="flex items-center gap-1.5 rounded-md border border-c-gray-200 bg-c-gray-50 px-2 py-1 text-[11px]"
            >
              <span className="max-w-[180px] truncate text-c-gray-700">{a.fileName}</span>
              <span className="text-c-gray-500">({(a.fileSize / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                onClick={() => removePending(idx)}
                className="ml-0.5 text-c-gray-300 hover:text-c-danger"
                aria-label={`Remove ${a.fileName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer pill — borders shift teal + a gentle glow when Full
          Fetch is armed, so the practitioner sees the mode change
          before they type. Same shape either way so layout doesn't
          jump. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-end gap-1.5 rounded-2xl border bg-white px-2 py-1.5 transition-all duration-200"
        style={
          fullFetch
            ? {
                borderColor: "var(--c-teal)",
                boxShadow: "var(--shadow-glow, 0 0 0 1px rgba(42,143,168,0.12), 0 4px 16px rgba(42,143,168,0.08))",
              }
            : undefined
        }
      >
        <label
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-c-gray-300 transition-colors hover:bg-c-gray-50 hover:text-c-gray-500"
          title="Attach file"
        >
          <Paperclip className="h-[15px] w-[15px]" />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.docx,.txt"
            multiple
            onChange={handleFileChange}
            disabled={disabled}
          />
        </label>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[13.5px] placeholder:text-c-gray-300 focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{ maxHeight: MAX_TEXTAREA_PX + "px", minHeight: "36px" }}
        />
        {onToggleFullFetch && (
          <button
            type="button"
            onClick={onToggleFullFetch}
            disabled={disabled}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] transition-all duration-150"
            style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: fullFetch ? "var(--c-teal)" : "transparent",
              color: fullFetch ? "white" : "var(--c-gray-500)",
              border: `1px solid ${fullFetch ? "var(--c-teal)" : "var(--c-gray-200)"}`,
            }}
            title={
              fullFetch
                ? "Full Fetch is on — claude-opus-4-7 with the live case packet. Click to turn off."
                : "Turn on Full Fetch — unlocks claude-opus-4-7, loads the full client + documents + liability + deadlines packet, and surfaces page diagnostics."
            }
            aria-pressed={fullFetch}
            aria-label={fullFetch ? "Turn off Full Fetch" : "Turn on Full Fetch"}
          >
            <Sparkles
              className="h-3.5 w-3.5"
              style={fullFetch ? { filter: "drop-shadow(0 0 2px rgba(255,255,255,0.4))" } : undefined}
            />
            <span className="hidden sm:inline">
              {fullFetch ? "Full Fetch" : "Full Fetch"}
            </span>
          </button>
        )}
        <button
          type="submit"
          disabled={!canSend}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-30"
          style={{
            background: canSend ? "var(--c-teal)" : "var(--c-gray-100)",
            color: canSend ? "white" : "var(--c-gray-300)",
          }}
          title="Send message"
          aria-label="Send message"
        >
          <Send className="h-[14px] w-[14px]" />
        </button>
      </form>
      <p className="text-center text-[11px] text-c-gray-300">
        {fullFetch
          ? "Full Fetch on — claude-opus-4-7 with live case data. Review every output."
          : "Junebug can make mistakes — review before relying on any output."}
      </p>
    </div>
  )
}
