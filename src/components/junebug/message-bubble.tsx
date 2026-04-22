"use client"

/**
 * Single message row (spec §7.7).
 *
 *   - User: right-aligned dark bubble on --c-navy-950.
 *   - Assistant: full-width prose in junebug-prose, no bubble.
 *   - Error: red left border, error text, Retry button.
 *   - Streaming: subtle pulse on the last chunk until `done`.
 */

import { useState } from "react"
import { Check, Copy, RotateCcw, X } from "lucide-react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import type { JunebugMessage } from "./types"

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text: string) {
  const rawHtml = marked.parse(text) as string
  const cleanHtml =
    typeof window !== "undefined" ? DOMPurify.sanitize(rawHtml) : ""
  return (
    <div
      className="junebug-prose"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.setAttribute("readonly", "")
        ta.style.position = "absolute"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(ta)
        if (!ok) throw new Error("execCommand copy failed")
      }
      setCopied(true)
      setFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setFailed(true)
      setTimeout(() => setFailed(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-c-gray-300 opacity-0 transition-opacity hover:text-c-gray-500 group-hover:opacity-100"
      title={failed ? "Copy failed" : "Copy message"}
      aria-label={failed ? "Copy failed" : "Copy message"}
    >
      {copied ? (
        <Check className="h-4 w-4 text-c-success" />
      ) : failed ? (
        <X className="h-4 w-4 text-destructive" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}

export interface MessageBubbleProps {
  message: JunebugMessage
  /** When true, this is the last assistant message and still actively streaming. */
  isStreaming: boolean
  /** For assistant error rows — regenerate this message. */
  onRetry?: (message: JunebugMessage) => void
}

export function MessageBubble({ message, isStreaming, onRetry }: MessageBubbleProps) {
  if (message.role === "USER") {
    return (
      <div className="flex animate-message-in justify-end">
        <div
          className="group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px] text-white"
          style={{ backgroundColor: "var(--c-navy-950)", lineHeight: "1.5" }}
        >
          <span className="whitespace-pre-wrap">{message.content}</span>
          {message.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 border-t border-white/10 pt-1.5">
              {message.attachments.map((a) => (
                <span
                  key={a.id}
                  className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/80"
                  title={`${a.fileType} · ${(a.fileSize / 1024).toFixed(0)} KB`}
                >
                  {a.fileName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ASSISTANT
  const isError = !!message.errorMessage
  if (isError) {
    return (
      <div className="flex animate-message-in justify-start gap-2.5">
        <div className="mt-1 flex-shrink-0">
          <JunebugIcon className="h-5 w-5" style={{ color: "var(--c-danger)" }} />
        </div>
        <div className="group relative max-w-[92%] rounded-lg border border-l-4 border-c-gray-100 border-l-c-danger bg-white px-3 py-2 text-[13.5px] text-c-gray-900">
          <p className="text-c-danger">{message.errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-c-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-c-gray-700 hover:bg-c-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex animate-message-in justify-start gap-2.5">
      <div className="mt-1 flex-shrink-0">
        <JunebugIcon
          className="h-5 w-5"
          mood={isStreaming ? "thinking" : "idle"}
          animated={isStreaming}
          style={{ color: "var(--c-warning)" }}
        />
      </div>
      <div className="group relative max-w-[92%] text-[13.5px] text-c-gray-900">
        {message.content ? (
          renderMarkdown(message.content)
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-c-gray-300">
            <span className="text-[13px]">Thinking…</span>
          </div>
        ) : null}
        {message.content && (
          <div className="mt-1 flex items-center gap-1">
            <CopyButton text={message.content} />
            {!isStreaming && onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="rounded p-1 text-c-gray-300 opacity-0 transition-opacity hover:text-c-gray-500 group-hover:opacity-100"
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
