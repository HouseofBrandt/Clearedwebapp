"use client"

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react"
import { usePathname } from "next/navigation"
import { X, Trash2, Copy, Check, ChevronDown, Send, Sparkles, Bug, Lightbulb, MessageSquare, CheckCircle2, Pencil } from "lucide-react"

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
  tabsNumber: string
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
      if (isOrdered) {
        elements.push(
          <ol key={`list-${i}`} className="my-1 ml-4 list-decimal [&>li]:pl-1" style={{ listStyleType: "decimal" }}>
            {listItems}
          </ol>
        )
      } else {
        elements.push(
          <ul key={`list-${i}`} className="my-1 ml-4 list-disc [&>li]:pl-1" style={{ listStyleType: "disc" }}>
            {listItems}
          </ul>
        )
      }
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
    const legal: Record<string, string> = {
      OIC: "Explain the RCP calculation for this case type",
      IA: "Does this client qualify for a streamlined IA?",
      PENALTY: "What are the FTA requirements?",
      CDP: "What issues can be raised at a CDP hearing?",
      TFRP: "How do we prepare for a Form 4180 interview?",
      INNOCENT_SPOUSE: "Compare § 6015(b) vs (c) vs (f) relief",
      CNC: "What qualifies for CNC status?",
    }
    return [
      "What should I do next on this case?",
      legal[caseContext.caseType] || "What resolution options are available?",
      "What documents am I missing?",
    ]
  }
  return [
    "Good morning — what needs my attention today?",
    "Any overdue deadlines across my cases?",
    "Show me the practice compliance dashboard",
    "What's in the review queue?",
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
// Message draft parser and card
// -------------------------------------------------------------------
interface MessageDraft {
  type: string
  subject: string
  body: string
  priority?: string
  tags?: string
}

function parseMessageDraft(content: string): { before: string; draft: MessageDraft | null; after: string } {
  const match = content.match(/:::message\n([\s\S]*?):::/)
  if (!match) return { before: content, draft: null, after: "" }

  const before = content.slice(0, match.index)
  const after = content.slice((match.index || 0) + match[0].length)
  const block = match[1]

  const draft: any = {}
  const bodyMatch = block.match(/body:\s*([\s\S]*?)(?=\n[a-z]+:|$)/i)
  if (bodyMatch) draft.body = bodyMatch[1].trim()

  for (const line of block.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv && kv[1] !== "body") {
      draft[kv[1]] = kv[2].trim()
    }
  }

  if (!draft.type || !draft.subject) return { before: content, draft: null, after: "" }
  return { before: before.trim(), draft: draft as MessageDraft, after: after.trim() }
}

function MessageDraftCard({ draft, onStatusChange }: { draft: MessageDraft; onStatusChange?: (status: "sent" | "cancelled") => void }) {
  const [status, setStatus] = useState<"draft" | "sending" | "sent" | "cancelled">("draft")

  const typeConfig: Record<string, { icon: React.ElementType; label: string; border: string }> = {
    BUG_REPORT: { icon: Bug, label: "Bug Report", border: "border-l-red-400" },
    FEATURE_REQUEST: { icon: Lightbulb, label: "Feature Request", border: "border-l-purple-400" },
    DIRECT_MESSAGE: { icon: MessageSquare, label: "Direct Message", border: "border-l-blue-400" },
  }
  const config = typeConfig[draft.type] || typeConfig.DIRECT_MESSAGE
  const Icon = config.icon

  const handleSend = async () => {
    setStatus("sending")
    try {
      const res = await fetch("/api/messages/from-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          subject: draft.subject,
          body: draft.body,
          priority: draft.priority || (draft.type === "BUG_REPORT" ? "HIGH" : "NORMAL"),
          tags: draft.tags ? draft.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        }),
      })
      if (!res.ok) throw new Error("Failed")
      setStatus("sent")
      onStatusChange?.("sent")
    } catch {
      setStatus("draft")
      alert("Failed to send. Please try again.")
    }
  }

  if (status === "sent") {
    const target = draft.type === "DIRECT_MESSAGE" ? "recipient" : "administrators"
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        {config.label} sent to {target}
      </div>
    )
  }

  if (status === "cancelled") return null

  return (
    <div className={`rounded-lg border border-l-4 ${config.border} bg-white p-3`}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </div>
      <p className="mt-1.5 text-sm font-medium">{draft.subject}</p>
      <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{draft.body}</p>
      {(draft.priority || draft.tags) && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {draft.priority && `Priority: ${draft.priority}`}
          {draft.priority && draft.tags && " · "}
          {draft.tags && `Tags: ${draft.tags}`}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSend}
          disabled={status === "sending"}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#1B2A4A" }}
        >
          {status === "sending" ? "Sending..." : "Send"}
        </button>
        <button
          onClick={() => { setStatus("cancelled"); onStatusChange?.("cancelled") }}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Action parser and card (:::action blocks)
// -------------------------------------------------------------------
interface ChatAction {
  type: string
  caseId?: string
  [key: string]: any
}

function parseActionBlocks(content: string): { text: string; actions: ChatAction[] } {
  const actions: ChatAction[] = []
  let text = content

  const regex = /:::action\n([\s\S]*?):::/g
  let match
  while ((match = regex.exec(content)) !== null) {
    text = text.replace(match[0], "")
    const block = match[1]
    const action: any = {}

    // Parse YAML-like fields
    const lines = block.split("\n")
    let currentKey = ""
    let arrayItems: any[] = []
    let inArray = false

    for (const line of lines) {
      const kvMatch = line.match(/^(\w+):\s*(.*)$/)
      if (kvMatch) {
        if (inArray && currentKey) {
          action[currentKey] = arrayItems
          arrayItems = []
          inArray = false
        }
        currentKey = kvMatch[1]
        const val = kvMatch[2].trim()
        if (val) action[currentKey] = val
      } else if (line.trim().startsWith("- label:")) {
        inArray = true
        const label = line.replace(/^\s*-\s*label:\s*/, "").trim()
        arrayItems.push({ label, critical: false })
      } else if (line.trim().startsWith("critical:") && arrayItems.length > 0) {
        arrayItems[arrayItems.length - 1].critical = line.includes("true")
      }
    }
    if (inArray && currentKey) {
      action[currentKey] = arrayItems
    }

    if (action.type) actions.push(action as ChatAction)
  }

  return { text: text.trim(), actions }
}

function ActionCard({ action, caseContext }: { action: ChatAction; caseContext: CaseContext | null }) {
  const [status, setStatus] = useState<"pending" | "executing" | "done" | "cancelled">("pending")
  const [resultMsg, setResultMsg] = useState("")

  const caseId = action.caseId || caseContext?.caseId

  const handleExecute = async () => {
    if (!caseId) return
    setStatus("executing")
    try {
      const payload: any = { ...action }
      delete payload.type
      delete payload.caseId

      const res = await fetch("/api/ai/chat-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.type, caseId, payload }),
      })
      if (!res.ok) throw new Error("Action failed")
      const data = await res.json()
      setStatus("done")
      setResultMsg(data.message || "Action completed")
      // Navigate if redirect is specified (e.g., open Banjo tab)
      if (data.redirectTo && typeof window !== "undefined") {
        window.location.href = data.redirectTo
      }
    } catch {
      setStatus("pending")
      alert("Action failed. Please try again.")
    }
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        {resultMsg || "Action completed"}
      </div>
    )
  }
  if (status === "cancelled") return null

  const configs: Record<string, { icon: string; label: string; border: string }> = {
    GENERATE_DOCUMENT_REQUEST: { icon: "\uD83D\uDCCB", label: "Document Request", border: "border-l-blue-400" },
    UPDATE_CASE_STATUS: { icon: "\uD83D\uDCCA", label: "Update Case Status", border: "border-l-purple-400" },
    CREATE_DEADLINE: { icon: "\uD83D\uDCC5", label: "Create Deadline", border: "border-l-amber-400" },
    UPDATE_IRS_STATUS: { icon: "\uD83C\uDFDB\uFE0F", label: "Update IRS Status", border: "border-l-red-400" },
    ADD_CASE_NOTE: { icon: "\uD83D\uDCDD", label: "Add Case Note", border: "border-l-gray-400" },
    CREATE_BANJO_ASSIGNMENT: { icon: "\uD83E\uDE95", label: "Banjo Assignment", border: "border-l-emerald-400" },
    ADD_TO_KNOWLEDGE_BASE: { icon: "\uD83D\uDCDA", label: "Add to Knowledge Base", border: "border-l-violet-400" },
    SEARCH_KNOWLEDGE_BASE: { icon: "\uD83D\uDD0D", label: "Search Knowledge Base", border: "border-l-cyan-400" },
  }
  const config = configs[action.type] || { icon: "⚡", label: action.type, border: "border-l-gray-400" }

  const buttonLabels: Record<string, string> = {
    GENERATE_DOCUMENT_REQUEST: "Generate & Add to Deliverables",
    UPDATE_CASE_STATUS: "Update Status",
    CREATE_DEADLINE: "Create Deadline",
    UPDATE_IRS_STATUS: "Update IRS Status",
    ADD_CASE_NOTE: "Add Note",
    CREATE_BANJO_ASSIGNMENT: "Create Assignment",
    ADD_TO_KNOWLEDGE_BASE: "Add to KB",
    SEARCH_KNOWLEDGE_BASE: "Search",
  }

  return (
    <div className={`rounded-lg border border-l-4 ${config.border} bg-white p-3`}>
      <div className="text-xs font-medium text-muted-foreground">
        {config.icon} {config.label}
      </div>

      <div className="mt-2 space-y-1 text-sm">
        {action.type === "GENERATE_DOCUMENT_REQUEST" && action.missingDocs && (
          <>
            <p className="font-medium">{action.clientName || "Client"}</p>
            {(action.missingDocs as any[]).map((doc: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span>{doc.critical ? "❌" : "⬜"}</span>
                <span>{doc.label}</span>
              </div>
            ))}
          </>
        )}
        {action.type === "UPDATE_CASE_STATUS" && (
          <>
            <p>Move to: <span className="font-medium">{action.phase}</span></p>
            {action.notes && <p className="text-xs text-muted-foreground">Note: {action.notes}</p>}
          </>
        )}
        {action.type === "CREATE_DEADLINE" && (
          <>
            <p className="font-medium">{action.title}</p>
            <p className="text-xs text-muted-foreground">Due: {action.dueDate} · Priority: {action.priority || "MEDIUM"}</p>
            {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
          </>
        )}
        {action.type === "UPDATE_IRS_STATUS" && (
          <>
            {action.irsLastAction && <p className="font-medium">{action.irsLastAction}</p>}
            {action.irsAssignedUnit && <p className="text-xs text-muted-foreground">Unit: {action.irsAssignedUnit}</p>}
            {action.notes && <p className="text-xs text-muted-foreground">{action.notes}</p>}
          </>
        )}
        {action.type === "ADD_CASE_NOTE" && (
          <p>{action.note}</p>
        )}
        {action.type === "CREATE_BANJO_ASSIGNMENT" && (
          <>
            <p className="font-medium">Assignment</p>
            <p className="text-xs text-muted-foreground">{(action as any).assignmentText?.substring(0, 200)}</p>
          </>
        )}
        {action.type === "ADD_TO_KNOWLEDGE_BASE" && (
          <>
            <p className="font-medium">{(action as any).title}</p>
            <p className="text-xs text-muted-foreground">Category: {(action as any).category || "Custom"}</p>
            {(action as any).tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {((action as any).tags as string[]).slice(0, 5).map((tag: string) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{tag}</span>
                ))}
              </div>
            )}
          </>
        )}
        {action.type === "SEARCH_KNOWLEDGE_BASE" && (
          <p>Search: <span className="font-medium">{(action as any).query}</span></p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleExecute}
          disabled={status === "executing" || !caseId}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#1B2A4A" }}
        >
          {status === "executing" ? "Executing..." : buttonLabels[action.type] || "Execute"}
        </button>
        <button
          onClick={() => setStatus("cancelled")}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
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
            tabsNumber: data.tabsNumber,
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
          title="Ask Junebug"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Slide-out panel */}
      {isOpen && (
        <div
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl lg:w-[420px]"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: "#1B2A4A" }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-white" />
              <h2 className="text-base font-semibold text-white">Junebug</h2>
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
                  <div className="absolute right-0 top-full mt-1 w-36 rounded-md border bg-white py-1 shadow-lg z-[60]">
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
                {caseContext.tabsNumber} &middot; {caseContext.caseType}
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
                  <p className="text-sm font-medium text-gray-700">Junebug</p>
                  <p className="mt-1 text-xs text-gray-500">Tax research, platform help, and more</p>
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
                            (() => {
                              // Parse action blocks first
                              const { text: textWithoutActions, actions } = parseActionBlocks(msg.content)
                              const { before, draft, after } = parseMessageDraft(textWithoutActions)
                              const hasSpecialContent = draft || actions.length > 0

                              if (hasSpecialContent) {
                                const textContent = draft ? before : textWithoutActions
                                return (
                                  <div className="space-y-2">
                                    {textContent && <div className="prose prose-sm max-w-none">{renderMarkdown(textContent)}</div>}
                                    {draft && <MessageDraftCard draft={draft} />}
                                    {draft && after && <div className="prose prose-sm max-w-none">{renderMarkdown(after)}</div>}
                                    {actions.map((action, idx) => (
                                      <ActionCard key={idx} action={action} caseContext={caseContext} />
                                    ))}
                                  </div>
                                )
                              }
                              return (
                                <div className="prose prose-sm max-w-none">
                                  {renderMarkdown(msg.content)}
                                </div>
                              )
                            })()
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
                placeholder="Ask Junebug anything..."
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