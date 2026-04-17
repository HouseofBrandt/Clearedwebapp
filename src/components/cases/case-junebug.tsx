"use client"

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowUpRight, Send, ChevronUp, ChevronDown } from "lucide-react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { getJunebugMessage } from "@/lib/junebug/loading-messages"
import { junebugThreadsEnabled } from "@/lib/junebug/feature-flag"

interface CaseJunebugProps {
  caseId: string
  caseContext: {
    caseId: string
    tabsNumber: string
    caseType: string
    status: string
    filingStatus?: string
    totalLiability?: number
  }
  collapsed: boolean
  onToggle: () => void
  digest?: string | null
  /**
   * Server-computed: is the Junebug Threads workspace visible for the
   * viewing user? Combines the global flag with the
   * JUNEBUG_BETA_EMAIL_DOMAINS gate. When undefined, falls back to the
   * global-flag-only check (backward-compatible with pre-beta-gate
   * callers) so the legacy inline chat still shows when the flag is off.
   */
  junebugVisible?: boolean
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

/**
 * Thin wrapper. Spec §9: when the threads workspace is on AND visible
 * for this user, the inline widget gives way to a link that opens the
 * full workspace with this case pre-scoped. Users outside the beta
 * gate keep seeing the legacy inline chat — clicking a link that 404s
 * would be worse UX than staying on the old surface.
 *
 * The branch happens at the component boundary so hooks in the legacy
 * inline component still obey the rules of hooks.
 */
export function CaseJunebug(props: CaseJunebugProps) {
  const visible = props.junebugVisible ?? junebugThreadsEnabled()
  if (visible) {
    return <CaseJunebugLink caseId={props.caseId} />
  }
  return <LegacyInlineCaseJunebug {...props} />
}

function CaseJunebugLink({ caseId }: { caseId: string }) {
  return (
    <div className="border-t">
      <Link
        href={`/junebug?case=${caseId}`}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <JunebugIcon className="h-4 w-4" style={{ color: "var(--c-warning)" }} />
          <span className="text-xs font-medium text-c-gray-700">Ask Junebug about this case</span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </div>
  )
}

function LegacyInlineCaseJunebug({ caseId, caseContext, collapsed, onToggle, digest }: CaseJunebugProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")
  const [shownMessages, setShownMessages] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loadingInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!collapsed && inputRef.current) {
      inputRef.current.focus()
    }
  }, [collapsed])

  // Rotate loading messages
  useEffect(() => {
    if (isStreaming) {
      const msg = getJunebugMessage("thinking", shownMessages)
      setLoadingMessage(msg)
      setShownMessages(prev => [...prev, msg])
      loadingInterval.current = setInterval(() => {
        const next = getJunebugMessage("thinking", shownMessages)
        setLoadingMessage(next)
        setShownMessages(prev => [...prev, next])
      }, 4500)
    } else {
      if (loadingInterval.current) clearInterval(loadingInterval.current)
    }
    return () => { if (loadingInterval.current) clearInterval(loadingInterval.current) }
  }, [isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: content.trim() }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" }

    const updatedMessages = [...messages, userMsg]
    setMessages([...updatedMessages, assistantMsg])
    setInput("")
    setIsStreaming(true)

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          caseContext,
          model: "claude-opus-4-6",
        }),
      })

      if (!response.ok) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: "Junebug got distracted. Try again?" } : m
        ))
        setIsStreaming(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) { setIsStreaming(false); return }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: m.content + data.text } : m
              ))
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, content: m.content || "Junebug got distracted. Try again?" } : m
      ))
    } finally {
      setIsStreaming(false)
    }
  }, [messages, caseContext, isStreaming])

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); sendMessage(input) }
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div className="border-t">
      {/* Header / toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <JunebugIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Junebug</span>
        </div>
        {collapsed
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </button>

      {!collapsed && (
        <div className="flex flex-col" style={{ maxHeight: "320px" }}>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2" style={{ maxHeight: "240px" }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <JunebugIcon className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Junebug is here. Ask anything about this case.
                </p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-md px-2.5 py-1.5 text-xs ${
                  msg.role === "user"
                    ? "text-white"
                    : "bg-muted text-foreground"
                }`}
                style={msg.role === "user" ? { backgroundColor: "#1B2A4A" } : undefined}
                >
                  {msg.content || (isStreaming && msg === messages[messages.length - 1] ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <JunebugIcon className="h-3.5 w-3.5" animated />
                      <span className="text-[11px]">{loadingMessage}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-4 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Junebug about this case..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none rounded-md border px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                style={{ minHeight: "32px", maxHeight: "80px" }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = "32px"
                  t.style.height = Math.min(t.scrollHeight, 80) + "px"
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-md text-white disabled:opacity-40"
                style={{ backgroundColor: "#1B2A4A" }}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
