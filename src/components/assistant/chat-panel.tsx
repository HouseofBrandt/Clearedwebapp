"use client"

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react"
import { usePathname } from "next/navigation"
import { X, Trash2, Copy, Check, ChevronDown, Send, Sparkles } from "lucide-react"

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface CaseContext {
  caseId: string
  caseNumber: string
  caseType: string
  status: string
  filingStatus?: string
  totalLiability?: number
}

// -------------------------------------------------------------------
// Simple markdown renderer (no library dependency)
// -------------------------------------------------------------------
function renderMarkdown(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre key={i} className="my-2 overflow-x-auto rounded bg-gray-800 p-3 text-sm text-gray-100">
          <code>{codeLines.join("\n")}</code>
        </pre>
      )
      continue
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />)
      i++
      continue
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="mt-3 mb-1 font-semibold">{formatInline(line.slice(4))}</h4>)
      i++
      continue
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="mt-3 mb-1 text-lg font-semibold">{formatInline(line.slice(3))}</h3>)
      i++
      continue
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="mt-3 mb-1 text-xl font-semibold">{formatInline(line.slice(2))}</h2>)
      i++
      continue
    }

    // List items (- or * or numbered)
    if (/^(\s*)[-*]\s/.test(line) || /^(\s*)\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      const isOrdered = /^\s*\d+\.\s/.test(line)
      while (i < lines.length && (/^(\s*)[-*]\s/.test(lines[i]) || /^(\s*)\d+\.\s/.test(lines[i]))) {
        const itemText = lines[i].replace(/^(\s*)[-*]\s/, "").replace(/^(\s*)\d+\.\s/, "")
        listItems.push(<li key={i}>{formatInline(itemText)}</li>)
        i++
      }
      const ListTag = isOrdered ? "ol" : "ul"
      elements.push(
        <ListTag key={`list-${i}`} className={`my-1 ml-4 ${isOrdered ? "list-decimal" : "list-disc"}`}>
          {listItems}
        </ListTag>
      )
      continue
    }

    // Regular paragraph
    elements.push(<p key={i} className="my-1">{formatInline(line)}</p>)
    i++
  }

  return <>{elements}</>
}

function formatInline(text: string): React.ReactNode {
  // Bold, italic, inline code
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const m = match[0]
    if (m.startsWith("**") && m.endsWith("**")) {
      parts.push(<strong key={match.index}>{m.slice(2, -2)}</strong>)
    } else if (m.startsWith("*") && m.endsWith("*")) {
      parts.push(<em key={match.index}>{m.slice(1, -1)}</em>)
    } else if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(<code key={match.index} className="rounded bg-gray-200 px-1 py-0.5 text-sm">{m.slice(1, -1)}</code>)
    }
    lastIndex = match.index + m.length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

// -------------------------------------------------------------------
// Suggested questions
// -------------------------------------------------------------------
function getSuggestions(caseContext: CaseContext | null): string[] {
  if (caseContext) {
    const type = caseContext.caseType
    if (type === "OIC") {
      return [
        "What's the RCP calculation methodology?",
        "Explain dissipated asset rules for OIC",
        "What are IRS National Standards for a family of 5?",
      ]
    }
    if (type === "IA") {
      return [
        "When does a taxpayer qualify for a streamlined IA?",
        "What is a PPIA and when should we consider one?",
        "Explain the IA user fee and financial hardship waiver",
      ]
    }
    if (type === "PENALTY") {
      return [
        "What are the requirements for First Time Abate?",
        "How does reasonable cause work under Treas. Reg. § 301.6651-1(c)?",
        "Can we stack FTA with reasonable cause?",
      ]
    }
    if (type === "CDP") {
      return [
        "What are the CDP hearing request deadlines?",
        "What issues can be raised at a CDP hearing?",
        "Explain equivalent hearing vs timely CDP request",
      ]
    }
    if (type === "TFRP") {
      return [
        "What makes someone a responsible person under IRC § 6672?",
        "How is willfulness determined for TFRP?",
        "Can we appeal a proposed TFRP assessment?",
      ]
    }
    if (type === "INNOCENT_SPOUSE") {
      return [
        "Compare relief under IRC § 6015(b), (c), and (f)",
        "What factors does Rev. Proc. 2013-34 weigh?",
        "What is the deadline to request innocent spouse relief?",
      ]
    }
    if (type === "CNC") {
      return [
        "What are the criteria for CNC hardship designation?",
        "Does CNC status stop the CSED?",
        "How often does the IRS review CNC accounts?",
      ]
    }
  }

  return [
    "What are the requirements for an OIC under DATC?",
    "Explain CSED calculation and tolling events",
    "Compare PPIA vs OIC for large liability",
    "What makes someone responsible under IRC § 6672?",
  ]
}

// -------------------------------------------------------------------
// Copy button component
// -------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100"
      title="Copy message"
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

// -------------------------------------------------------------------
// Streaming dots
// -------------------------------------------------------------------
function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
    </span>
  )
}

// -------------------------------------------------------------------
// Main ChatPanel component
// -------------------------------------------------------------------
export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [caseContext, setCaseContext] = useState<CaseContext | null>(null)
  const [model, setModel] = useState<"claude-sonnet-4-6" | "claude-opus-4-6">("claude-sonnet-4-6")
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pathname = usePathname()

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Detect case context from route
  useEffect(() => {
    const match = pathname.match(/\/cases\/([^/]+)/)
    if (match) {
      const caseId = match[1]
      fetch(`/api/cases/${caseId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch case")
          return res.json()
        })
        .then((data) => {
          setCaseContext({
            caseId: data.id,
            caseNumber: data.caseNumber,
            caseType: data.caseType,
            status: data.status,
            filingStatus: data.filingStatus,
            totalLiability: data.totalLiability,
          })
        })
        .catch(() => {
          setCaseContext(null)
        })
    } else {
      setCaseContext(null)
    }
  }, [pathname])

  // Close model dropdown when clicking elsewhere
  useEffect(() => {
    if (!showModelDropdown) return
    const handleClick = () => setShowModelDropdown(false)
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [showModelDropdown])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }

      const updatedMessages = [...messages, userMsg]
      setMessages([...updatedMessages, assistantMsg])
      setInput("")
      setIsStreaming(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            caseContext,
            model,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: `Error: ${errorText || response.statusText}` } : m
            )
          )
          setIsStreaming(false)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setIsStreaming(false)
          return
        }

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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: m.content + data.text } : m
                  )
                )
              }
              if (data.done) break
              if (data.error) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: m.content + `\n\nError: ${data.error}` } : m
                  )
                )
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || "Failed to connect. Please try again." }
                : m
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, caseContext, model, isStreaming]
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearConversation = () => {
    if (isStreaming && abortRef.current) {
      abortRef.current.abort()
    }
    setMessages([])
    setIsStreaming(false)
  }

  const suggestions = getSuggestions(caseContext)

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg hover:scale-105 transition-transform lg:h-14 lg:w-14 h-12 w-12"
          style={{ backgroundColor: "#1B2A4A" }}
          title="Ask Cleared"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Slide-out panel */}
      {isOpen && (
        <div
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl lg:w-[420px]"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: "#1B2A4A" }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-white" />
              <h2 className="text-base font-semibold text-white">Ask Cleared</h2>
            </div>
            <div className="flex items-center gap-1">
              {/* Model toggle */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowModelDropdown(!showModelDropdown)
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {model === "claude-sonnet-4-6" ? "Sonnet" : "Opus"}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showModelDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-36 rounded-md border bg-white py-1 shadow-lg">
                    <button
                      onClick={() => { setModel("claude-sonnet-4-6"); setShowModelDropdown(false) }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-100 ${
                        model === "claude-sonnet-4-6" ? "font-medium text-gray-900" : "text-gray-600"
                      }`}
                    >
                      Sonnet <span className="text-xs text-gray-400">fast</span>
                    </button>
                    <button
                      onClick={() => { setModel("claude-opus-4-6"); setShowModelDropdown(false) }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-100 ${
                        model === "claude-opus-4-6" ? "font-medium text-gray-900" : "text-gray-600"
                      }`}
                    >
                      Opus <span className="text-xs text-gray-400">thorough</span>
                    </button>
                  </div>
                )}
              </div>

              {/* New conversation */}
              <button
                onClick={clearConversation}
                className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                title="New conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Case context pill */}
          {caseContext && (
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                {caseContext.caseNumber} &middot; {caseContext.caseType}
                {caseContext.totalLiability != null && (
                  <> &middot; ${Number(caseContext.totalLiability).toLocaleString()}</>
                )}
                <button
                  onClick={() => setCaseContext(null)}
                  className="ml-1 rounded-full p-0.5 hover:bg-blue-200"
                  title="Remove case context"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              /* Empty state with suggestions */
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <Sparkles className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Tax research assistant</p>
                  <p className="mt-1 text-xs text-gray-500">Ask about tax law, procedures, and strategies</p>
                </div>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Messages */
              <div className="flex flex-col gap-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`group relative max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                      style={msg.role === "user" ? { backgroundColor: "#1B2A4A" } : undefined}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          {msg.content ? (
                            <div className="prose prose-sm max-w-none">
                              {renderMarkdown(msg.content)}
                            </div>
                          ) : isStreaming && msg === messages[messages.length - 1] ? (
                            <StreamingDots />
                          ) : null}
                          {msg.content && <CopyButton text={msg.content} />}
                        </>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about tax law, procedures, strategies..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                style={{ maxHeight: "120px", minHeight: "38px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = "38px"
                  target.style.height = Math.min(target.scrollHeight, 120) + "px"
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: "#1B2A4A" }}
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}