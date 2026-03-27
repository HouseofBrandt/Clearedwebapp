"use client"

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react"
import { usePathname } from "next/navigation"
import { X, Trash2, Copy, Check, Send, Bug, Lightbulb, MessageSquare, CheckCircle2, Pencil, Paperclip, FileText, ChevronDown } from "lucide-react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { JunebugIcon, TreatBoneIcon } from "@/components/assistant/junebug-icon"
import {
  getJunebugLoadingMessage,
  getJunebugErrorMessage,
  JUNEBUG_EMPTY_STATE,
} from "@/lib/junebug/loading-messages"
import { browserDiagnostics } from "@/lib/browser-diagnostics"

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
// Markdown renderer (marked + DOMPurify)
// -------------------------------------------------------------------
marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text: string) {
  const rawHtml = marked.parse(text) as string
  const cleanHtml = typeof window !== "undefined"
    ? DOMPurify.sanitize(rawHtml)
    : rawHtml

  return (
    <div
      className="junebug-prose"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  )
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
      className="rounded p-1 text-c-gray-300 opacity-0 transition-opacity hover:text-c-gray-500 group-hover:opacity-100"
      title="Copy message"
    >
      {copied ? <Check className="h-4 w-4 text-c-success" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

// -------------------------------------------------------------------
// Treat button for chat — give Junebug a treat for good answers
// -------------------------------------------------------------------
function ChatTreatButton({ messageId }: { messageId: string }) {
  const [treated, setTreated] = useState(false)
  const [animating, setAnimating] = useState(false)

  const handleTreat = async () => {
    if (animating) return
    setAnimating(true)
    setTreated(!treated)

    try {
      await fetch("/api/assistant/treat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, action: treated ? "remove" : "give" }),
      })
    } catch { /* silent */ }

    setTimeout(() => setAnimating(false), 800)
  }

  return (
    <button
      onClick={handleTreat}
      className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all
        opacity-0 group-hover:opacity-100
        ${treated
          ? "bg-c-warning-soft text-c-warning border border-c-warning/20 dark:bg-c-warning/30 dark:text-c-warning dark:border-c-warning/30 opacity-100"
          : "bg-muted/50 hover:bg-c-warning-soft dark:hover:bg-c-warning/20 text-muted-foreground hover:text-c-warning border border-transparent hover:border-c-warning/20"
        }`}
      title={treated ? "Treat given! Junebug will remember this." : "Give Junebug a treat for a helpful answer"}
    >
      <TreatBoneIcon className="h-3 w-3" />
      {treated ? "Good girl!" : "Treat"}
    </button>
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
  const [status, setStatus] = useState<"draft" | "sending" | "sent" | "error" | "cancelled">("draft")
  const [errorMsg, setErrorMsg] = useState("")
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [screenshotData, setScreenshotData] = useState<string | null>(null)

  const typeConfig: Record<string, { icon: React.ElementType; label: string; border: string }> = {
    BUG_REPORT: { icon: Bug, label: "Bug Report", border: "border-l-c-danger" },
    FEATURE_REQUEST: { icon: Lightbulb, label: "Feature Request", border: "border-l-purple-400" },
    DIRECT_MESSAGE: { icon: MessageSquare, label: "Direct Message", border: "border-l-c-teal" },
  }
  const config = typeConfig[draft.type] || typeConfig.DIRECT_MESSAGE
  const Icon = config.icon

  const handleSend = async () => {
    setStatus("sending")
    const requestId = crypto.randomUUID()
    try {
      // Auto-attach browser diagnostics for bug reports
      const diagnosticsPayload = draft.type === "BUG_REPORT"
        ? {
            browserContext: browserDiagnostics.getContext(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          }
        : {}

      const res = await fetch("/api/messages/from-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          type: draft.type,
          subject: draft.subject,
          body: draft.body,
          priority: draft.priority || (draft.type === "BUG_REPORT" ? "HIGH" : "NORMAL"),
          tags: draft.tags ? draft.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
          screenshot: screenshotData || undefined,
          ...diagnosticsPayload,
        }),
      })
      if (!res.ok) throw new Error("Failed to send")
      setStatus("sent")
      setSubmissionId(requestId)
      onStatusChange?.("sent")
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Failed to send. Please try again.")
    }
  }

  if (status === "sent") {
    const target = draft.type === "DIRECT_MESSAGE" ? "recipient" : "administrators"
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-c-success-soft px-3 py-2 text-sm text-c-success">
        <CheckCircle2 className="h-4 w-4" />
        <span>{config.label} sent to {target}</span>
        {submissionId && <span className="ml-auto text-[10px] text-c-success/60">{submissionId.slice(0, 8)}</span>}
      </div>
    )
  }

  if (status === "cancelled") return null

  if (status === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-c-danger/20 bg-c-danger-soft px-3 py-2 text-sm text-c-danger">
          <X className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
        <button
          onClick={() => { setStatus("draft"); setErrorMsg("") }}
          className="text-xs text-muted-foreground hover:text-c-gray-700 underline"
        >
          Try again
        </button>
      </div>
    )
  }

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
      {/* Screenshot paste area for bug reports */}
      {draft.type === "BUG_REPORT" && (
        <div
          onPaste={(e) => {
            const items = e.clipboardData?.items
            if (items) {
              for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                  const file = item.getAsFile()
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = () => setScreenshotData(reader.result as string)
                    reader.readAsDataURL(file)
                  }
                }
              }
            }
          }}
          className="mt-2 border-2 border-dashed border-c-gray-200 rounded-lg p-3 text-center text-xs text-c-gray-300 cursor-pointer"
          tabIndex={0}
        >
          {screenshotData ? (
            <div className="space-y-1">
              <img src={screenshotData} className="rounded max-h-32 mx-auto" alt="Screenshot" />
              <button
                onClick={(e) => { e.stopPropagation(); setScreenshotData(null) }}
                className="text-[10px] text-c-danger hover:underline"
              >
                Remove screenshot
              </button>
            </div>
          ) : (
            <span>Paste screenshot here (Ctrl+V / Cmd+V)</span>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSend}
          disabled={status === "sending"}
          className="rounded-md bg-c-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
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

    // Parse simple single-line YAML-like fields only.
    // Multi-line content (like research text) is NOT parsed from the block —
    // it comes from the surrounding message text instead.
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

function ActionCard({ action, caseContext, messageText }: { action: ChatAction; caseContext: CaseContext | null; messageText?: string }) {
  const [status, setStatus] = useState<"pending" | "executing" | "done" | "error" | "cancelled">("pending")
  const [resultMsg, setResultMsg] = useState("")
  const [resultData, setResultData] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const caseId = action.caseId || caseContext?.caseId
  const caseIndependentActions = ["ADD_TO_KNOWLEDGE_BASE", "SEARCH_KNOWLEDGE_BASE"]
  const needsCaseId = !caseIndependentActions.includes(action.type)

  const handleExecute = async () => {
    if (needsCaseId && !caseId) return
    setStatus("executing")
    try {
      const payload: any = { ...action }
      delete payload.type
      delete payload.caseId
      // For KB actions, content comes from the message text, not the action block
      if (action.type === "ADD_TO_KNOWLEDGE_BASE") {
        payload.content = messageText
        // Tags are parsed as a comma-separated string from action blocks — normalize to array
        if (typeof payload.tags === "string") {
          payload.tags = payload.tags.split(",").map((t: string) => t.replace(/["\[\]]/g, "").trim()).filter(Boolean)
        }
      }

      const res = await fetch("/api/ai/chat-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.type, caseId: caseId || undefined, payload }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Action failed")
      }
      const data = await res.json()
      setStatus("done")
      setResultMsg(data.message || "Action completed")
      setResultData(data)
      // Navigate if redirect is specified (e.g., open Banjo tab)
      if (data.redirectTo && typeof window !== "undefined") {
        window.location.href = data.redirectTo
      }
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Action failed. Please try again.")
    }
  }

  if (status === "done") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border bg-c-success-soft px-3 py-2 text-sm text-c-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {resultMsg || "Action completed"}
        </div>
        {action.type === "SEARCH_KNOWLEDGE_BASE" && resultData?.results?.length > 0 && (
          <div className="rounded-lg border bg-c-gray-50 p-2 space-y-1.5">
            {resultData.results.map((r: any, i: number) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{r.title}</span>
                <span className="ml-1.5 text-muted-foreground">({r.category})</span>
                {r.preview && <p className="mt-0.5 text-muted-foreground line-clamp-2">{r.preview}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (status === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-c-danger/20 bg-c-danger-soft px-3 py-2 text-sm text-c-danger">
          <X className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
        <button
          onClick={() => { setStatus("pending"); setErrorMsg("") }}
          className="text-xs text-muted-foreground hover:text-c-gray-700 underline"
        >
          Try again
        </button>
      </div>
    )
  }
  if (status === "cancelled") return null

  const configs: Record<string, { icon: string; label: string; border: string }> = {
    GENERATE_DOCUMENT_REQUEST: { icon: "\uD83D\uDCCB", label: "Document Request", border: "border-l-c-teal" },
    UPDATE_CASE_STATUS: { icon: "\uD83D\uDCCA", label: "Update Case Status", border: "border-l-purple-400" },
    CREATE_DEADLINE: { icon: "\uD83D\uDCC5", label: "Create Deadline", border: "border-l-c-warning" },
    UPDATE_IRS_STATUS: { icon: "\uD83C\uDFDB\uFE0F", label: "Update IRS Status", border: "border-l-c-danger" },
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
                <span>{doc.critical ? "\uD83D\uDD34" : "\u26AA"}</span>
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
            {(action as any).tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(Array.isArray((action as any).tags)
                  ? (action as any).tags
                  : String((action as any).tags).split(",").map((t: string) => t.replace(/["\[\]]/g, "").trim()).filter(Boolean)
                ).slice(0, 5).map((tag: string) => (
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

      <div className="mt-3 space-y-1.5">
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={status === "executing" || (needsCaseId && !caseId)}
            className="rounded-md bg-c-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
          >
            {status === "executing" ? "Executing..." : buttonLabels[action.type] || "Execute"}
          </button>
          <button
            onClick={() => setStatus("cancelled")}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Dismiss
          </button>
        </div>
        {needsCaseId && !caseId && (
          <p className="text-[10px] text-muted-foreground">Open a case to enable this action</p>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Session storage helpers for chat persistence
// -------------------------------------------------------------------
const STORAGE_KEY_MESSAGES = "junebug-chat"
const STORAGE_KEY_CASE_CTX = "junebug-chat-case"

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_MESSAGES)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    // Rehydrate Date objects
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
  } catch {
    return []
  }
}

function saveMessages(msgs: ChatMessage[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(msgs))
  } catch { /* storage full or unavailable */ }
}

function loadStoredCaseContext(): CaseContext | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_CASE_CTX)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCaseContext(ctx: CaseContext | null) {
  if (typeof window === "undefined") return
  try {
    if (ctx) {
      sessionStorage.setItem(STORAGE_KEY_CASE_CTX, JSON.stringify(ctx))
    } else {
      sessionStorage.removeItem(STORAGE_KEY_CASE_CTX)
    }
  } catch { /* storage full or unavailable */ }
}

function clearStoredChat() {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(STORAGE_KEY_MESSAGES)
    sessionStorage.removeItem(STORAGE_KEY_CASE_CTX)
  } catch { /* silent */ }
}

// -------------------------------------------------------------------
// Main ChatPanel component
// -------------------------------------------------------------------
export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages)
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [caseContext, setCaseContext] = useState<CaseContext | null>(loadStoredCaseContext)
  const [contextAvailable, setContextAvailable] = useState<boolean | null>(null)
  const model = "claude-opus-4-6"
  const [loadingMessage, setLoadingMessage] = useState("")
  const recentLoadingMessagesRef = useRef<string[]>([])
  const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Full Fetch Mode state
  const [fullFetchMode, setFullFetchMode] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("junebug-full-fetch") === "true"
  })
  const [fullFetchActivating, setFullFetchActivating] = useState(false)

  // Error indicator on FAB — pulse red when recent browser errors exist
  const [hasRecentErrors, setHasRecentErrors] = useState(false)
  useEffect(() => {
    const interval = setInterval(() => {
      setHasRecentErrors(browserDiagnostics.hasRecentErrors())
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // FEAT-3: Cross-context case selector
  const [showCaseSelector, setShowCaseSelector] = useState(false)
  const [caseList, setCaseList] = useState<{ id: string; tabsNumber: string; caseType: string; status: string; clientName?: string; totalLiability?: number; filingStatus?: string }[]>([])
  const [caseListLoading, setCaseListLoading] = useState(false)

  // FEAT-4: File attachments
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string; size: number; dataUrl: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Close case selector when clicking outside
  useEffect(() => {
    if (!showCaseSelector) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-case-selector]")) {
        setShowCaseSelector(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showCaseSelector])

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    // Only persist when not in the middle of streaming (avoid saving partial assistant messages)
    if (!isStreaming) {
      saveMessages(messages)
    }
  }, [messages, isStreaming])

  // Persist case context to sessionStorage whenever it changes
  useEffect(() => {
    saveCaseContext(caseContext)
  }, [caseContext])

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
          setContextAvailable(null) // Reset until next API response
        })
        .catch(() => {
          setCaseContext(null)
          setContextAvailable(null)
        })
    } else {
      setCaseContext(null)
      setContextAvailable(null)
    }
  }, [pathname])

  // FEAT-3: Fetch case list for selector
  const fetchCaseList = useCallback(async () => {
    if (caseList.length > 0) return // already loaded
    setCaseListLoading(true)
    try {
      const res = await fetch("/api/cases?limit=20&sort=updatedAt")
      if (!res.ok) throw new Error("Failed to fetch cases")
      const data = await res.json()
      const cases = (data.cases || data || []).map((c: any) => ({
        id: c.id,
        tabsNumber: c.tabsNumber || c.caseNumber,
        caseType: c.caseType,
        status: c.status,
        clientName: c.clientName,
        totalLiability: c.totalLiability,
        filingStatus: c.filingStatus,
      }))
      setCaseList(cases)
    } catch {
      // silent
    } finally {
      setCaseListLoading(false)
    }
  }, [caseList.length])

  // FEAT-4: Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue // skip files > 10MB
      const reader = new FileReader()
      reader.onload = () => {
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, type: file.type, size: file.size, dataUrl: reader.result as string },
        ])
      }
      reader.readAsDataURL(file)
    }
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  function startLoadingMessages() {
    const msg = getJunebugLoadingMessage("thinking", recentLoadingMessagesRef.current)
    setLoadingMessage(msg)
    recentLoadingMessagesRef.current = [...recentLoadingMessagesRef.current, msg]

    loadingIntervalRef.current = setInterval(() => {
      const next = getJunebugLoadingMessage("thinking", recentLoadingMessagesRef.current)
      setLoadingMessage(next)
      recentLoadingMessagesRef.current = [...recentLoadingMessagesRef.current.slice(-6), next]
    }, 5000)
  }

  function stopLoadingMessages() {
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current)
      loadingIntervalRef.current = null
    }
    setLoadingMessage("")
  }

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
      startLoadingMessages()

      const abortController = new AbortController()
      abortRef.current = abortController

      // Capture any attached files and clear them
      const filesToSend = [...attachedFiles]
      setAttachedFiles([])

      try {
        // Check if the user message mentions bugs/errors — if so, attach browser diagnostics
        const hasBugKeywords = /bug|error|broken|not working|issue|problem|crash|fail|see this|seeing this/i.test(content)
        const pageContext = hasBugKeywords ? browserDiagnostics.getContext() : undefined

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            caseContext,
            model,
            fullFetch: fullFetchMode || undefined,
            attachments: filesToSend.length > 0 ? filesToSend : undefined,
            pageContext,
            currentRoute: typeof window !== "undefined" ? window.location.pathname : undefined,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: `🐕 ${getJunebugErrorMessage()}\n\n_${errorText || response.statusText}_` } : m
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
              if (data.meta) {
                // Handle metadata events (e.g., contextAvailable flag)
                if (typeof data.meta.contextAvailable === "boolean") {
                  setContextAvailable(data.meta.contextAvailable)
                }
              }
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
                ? { ...m, content: m.content || `🐕 ${getJunebugErrorMessage()}` }
                : m
            )
          )
        }
      } finally {
        stopLoadingMessages()
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, caseContext, model, isStreaming, attachedFiles, fullFetchMode]
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
    setContextAvailable(null)
    setAttachedFiles([])
    clearStoredChat()
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
          className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 hover:shadow-xl lg:h-14 lg:w-14"
          style={{
            background: fullFetchMode ? 'var(--c-gray-900)' : 'var(--c-gray-900)',
            border: fullFetchMode ? '2px solid var(--c-teal)' : '2px solid transparent',
            boxShadow: fullFetchMode ? '0 0 12px rgba(46,134,171,0.3), 0 4px 12px rgba(0,0,0,0.15)' : undefined,
          }}
          title={fullFetchMode ? "Junebug — Full Fetch Active" : "Ask Junebug"}
        >
          <span className="group-hover:hidden">
            <JunebugIcon className="h-7 w-7 text-white" mood="idle" fullFetch={fullFetchMode} />
          </span>
          <span className="hidden group-hover:block">
            <JunebugIcon className="h-7 w-7 text-white" mood="happy" fullFetch={fullFetchMode} />
          </span>
          {hasRecentErrors && !fullFetchMode && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-c-danger animate-pulse" />
          )}
        </button>
      )}

      {/* Slide-out panel */}
      {isOpen && (
        <div
          className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-c-gray-100 bg-white shadow-xl lg:w-[420px] ${fullFetchMode ? 'full-fetch-hud' : ''}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-c-gray-900 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${fullFetchActivating ? 'full-fetch-activating' : ''}`}
                style={{ background: fullFetchMode ? 'rgba(46,134,171,0.2)' : 'rgba(255,255,255,0.08)' }}>
                <JunebugIcon className="h-5 w-5" mood="happy" fullFetch={fullFetchMode}
                  style={{ color: fullFetchMode ? 'var(--c-teal)' : 'var(--c-warning)' }} />
              </div>
              <div>
                <h2 className="text-base font-medium text-white flex items-center gap-1.5">
                  Junebug
                  <span className="text-xs font-normal" style={{ color: fullFetchMode ? 'var(--c-teal)' : 'rgba(217,119,6,0.8)' }}>
                    {fullFetchMode ? '🛡️' : '🐕'}
                  </span>
                </h2>
                <p className="text-[10px] -mt-0.5" style={{ color: fullFetchMode ? 'var(--c-teal)' : 'var(--c-gray-300)' }}>
                  {fullFetchMode ? 'Full Fetch Mode' : 'Your tax resolution assistant'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Full Fetch toggle */}
              <button
                onClick={() => {
                  const newState = !fullFetchMode
                  setFullFetchMode(newState)
                  localStorage.setItem("junebug-full-fetch", String(newState))
                  if (newState) {
                    setFullFetchActivating(true)
                    setTimeout(() => setFullFetchActivating(false), 1200)
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-200"
                style={{
                  background: fullFetchMode ? 'rgba(46,134,171,0.12)' : 'transparent',
                  border: `1px solid ${fullFetchMode ? 'var(--c-teal)' : 'rgba(255,255,255,0.15)'}`,
                }}
                title={fullFetchMode ? 'Deactivate Full Fetch Mode' : 'Activate Full Fetch Mode — unlock all tools'}
              >
                <span className="text-[10px] font-medium" style={{
                  color: fullFetchMode ? 'var(--c-teal)' : 'var(--c-gray-300)',
                  letterSpacing: '0.04em',
                }}>
                  {fullFetchMode ? 'FULL FETCH' : 'Normal'}
                </span>
                <div className="w-6 h-3.5 rounded-full relative transition-colors duration-200"
                  style={{ background: fullFetchMode ? 'var(--c-teal)' : 'rgba(255,255,255,0.2)' }}>
                  <div className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all duration-200"
                    style={{ left: fullFetchMode ? '12px' : '2px' }} />
                </div>
              </button>

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

          {/* Full Fetch status bar */}
          {fullFetchMode && (
            <div className="full-fetch-status-bar px-3 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--c-teal)' }} />
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--c-teal)' }}>
                  Full Fetch Active
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--c-gray-300)' }}>
                All tools &middot; Cross-case &middot; Proactive
              </span>
            </div>
          )}

          {/* Case context pill or case selector */}
          {caseContext ? (
            <div className="flex items-center gap-2 border-b border-c-gray-100 bg-c-gray-50 px-4 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-c-info-soft px-3 py-1 text-xs font-medium text-c-teal">
                {caseContext.tabsNumber} &middot; {caseContext.caseType}
                {caseContext.totalLiability != null && (
                  <> &middot; ${Number(caseContext.totalLiability).toLocaleString()}</>
                )}
                <button
                  onClick={() => { setCaseContext(null); setContextAvailable(null) }}
                  className="ml-1 rounded-full p-0.5 hover:bg-c-info-soft"
                  title="Remove case context"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : (
            <div className="flex items-center border-b border-c-gray-100 bg-c-gray-50 px-4 py-2">
              <div className="relative flex-1" data-case-selector>
                <button
                  onClick={() => { setShowCaseSelector(!showCaseSelector); fetchCaseList() }}
                  className="flex items-center gap-1.5 rounded-full bg-white border border-c-gray-200 px-3 py-1 text-xs text-c-gray-500 hover:border-c-gray-300 transition-colors"
                >
                  <span>Select a case for context</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showCaseSelector && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-white shadow-lg max-h-64 overflow-y-auto">
                    {caseListLoading ? (
                      <div className="px-3 py-4 text-xs text-center text-muted-foreground">Loading cases...</div>
                    ) : caseList.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-center text-muted-foreground">No cases found</div>
                    ) : (
                      caseList.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCaseContext({
                              caseId: c.id,
                              tabsNumber: c.tabsNumber,
                              caseType: c.caseType,
                              status: c.status,
                              filingStatus: c.filingStatus,
                              totalLiability: c.totalLiability,
                            })
                            setShowCaseSelector(false)
                            setContextAvailable(null)
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-c-gray-50 border-b last:border-b-0 transition-colors"
                        >
                          <span className="font-medium">{c.tabsNumber}</span>
                          <span className="ml-1.5 text-muted-foreground">{c.caseType}</span>
                          {c.clientName && <span className="ml-1.5 text-muted-foreground">- {c.clientName}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Context unavailable banner */}
          {caseContext && contextAvailable === false && (
            <div className="border-b border-c-gray-100 bg-c-gray-50 px-4 py-1.5">
              <p className="text-[11px] text-muted-foreground">
                General mode &mdash; live case data not loaded
              </p>
            </div>
          )}

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              /* Empty state with suggestions */
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-6">
                <div className={`rounded-full p-5 border ${fullFetchMode ? '' : 'bg-c-warning-soft dark:bg-c-warning/20'}`}
                  style={{
                    background: fullFetchMode ? 'rgba(46,134,171,0.08)' : undefined,
                    borderColor: fullFetchMode ? 'rgba(46,134,171,0.2)' : 'rgba(217,119,6,0.15)',
                  }}>
                  <JunebugIcon className="h-12 w-12" mood="happy" fullFetch={fullFetchMode}
                    style={{ color: fullFetchMode ? 'var(--c-teal)' : 'var(--c-warning)' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-c-gray-700">
                    Junebug is ready to help! 🐕
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-c-gray-300">
                    Ask about the case, tax law, what to do next, or anything else.
                    I&apos;ll fetch the answer.
                  </p>
                </div>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="rounded-lg border border-c-gray-100 px-3 py-2 text-left text-sm text-c-gray-700 hover:border-c-gray-200 hover:bg-c-gray-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Messages */
              <div className="flex flex-col gap-4">
                {messages.map((msg) => {
                  // Skip rendering empty assistant bubbles (no content, not actively streaming)
                  const isLastMsg = msg === messages[messages.length - 1]
                  if (msg.role === "assistant" && !msg.content && !(isStreaming && isLastMsg)) {
                    return null
                  }
                  return (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mt-1 flex-shrink-0">
                        <JunebugIcon className="h-5 w-5" mood={isStreaming && msg === messages[messages.length - 1] ? "thinking" : "idle"} animated={isStreaming && msg === messages[messages.length - 1]} fullFetch={fullFetchMode}
                          style={{ color: fullFetchMode ? 'var(--c-teal)' : 'var(--c-warning)' }} />
                      </div>
                    )}
                    <div
                      className={`group relative max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "text-white"
                          : "bg-c-gray-100 text-c-gray-900"
                      }`}
                      style={msg.role === "user" ? { backgroundColor: "rgb(15 23 42)" } : undefined}
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
                                    {textContent && renderMarkdown(textContent)}
                                    {draft && <MessageDraftCard draft={draft} />}
                                    {draft && after && renderMarkdown(after)}
                                    {actions.map((action, idx) => (
                                      <ActionCard key={idx} action={action} caseContext={caseContext} messageText={textWithoutActions} />
                                    ))}
                                  </div>
                                )
                              }
                              return (
                                <div>
                                  {renderMarkdown(msg.content)}
                                </div>
                              )
                            })()
                          ) : isStreaming && msg === messages[messages.length - 1] ? (
                            <div className="flex items-center gap-2 text-c-gray-300">
                              <JunebugIcon className="h-4 w-4 flex-shrink-0" animated />
                              <span className="text-[13px]">{loadingMessage || "Thinking..."}</span>
                            </div>
                          ) : null}
                          {msg.content && (
                            <div className="mt-1 flex items-center gap-1">
                              <CopyButton text={msg.content} />
                              <ChatTreatButton messageId={msg.id} />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="border-t border-c-gray-100 p-3">
            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-md border border-c-gray-200 bg-c-gray-50 px-2 py-1 text-xs">
                    {file.type.startsWith("image/") ? (
                      <img src={file.dataUrl} className="h-8 w-8 rounded object-cover" alt={file.name} />
                    ) : (
                      <FileText className="h-4 w-4 text-c-gray-400" />
                    )}
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)}KB)</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="ml-0.5 text-c-gray-300 hover:text-c-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-c-gray-300 hover:text-c-gray-500 transition-colors" title="Attach file">
                <Paperclip className="h-4 w-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.docx,.txt"
                  multiple
                  onChange={handleFileUpload}
                  disabled={isStreaming}
                />
              </label>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Junebug anything..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-c-gray-200 px-3 py-2 text-sm placeholder:text-c-gray-300 focus:border-c-teal/30 focus:outline-none focus:ring-1 focus:ring-c-teal disabled:opacity-50"
                style={{ maxHeight: "120px", minHeight: "38px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = "38px"
                  target.style.height = Math.min(target.scrollHeight, 120) + "px"
                }}
              />
              <button
                type="submit"
                disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-c-gray-900 text-white transition-colors disabled:opacity-40"
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