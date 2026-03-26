"use client"

import { useState, useEffect, useRef } from "react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JunebugFormAssistantProps {
  formNumber: string
  formTitle: string
  activeSection: string
  activeSectionTitle: string
  activeField?: string
  activeFieldLabel?: string
  fieldIrsReference?: string
  currentValues: Record<string, any>
  caseId?: string
  onClose: () => void
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JunebugFormAssistant({
  formNumber,
  formTitle,
  activeSection,
  activeSectionTitle,
  activeField,
  activeFieldLabel,
  fieldIrsReference,
  currentValues,
  caseId,
  onClose,
}: JunebugFormAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"scoped" | "general">("scoped")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Context header updates when field changes
  const contextLabel =
    mode === "scoped" && activeField
      ? `${formTitle} > ${activeSectionTitle} > ${activeFieldLabel || activeField}`
      : `${formTitle} — General Mode`

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setLoading(true)

    try {
      const res = await fetch("/api/assistant/form-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          formNumber,
          activeSection,
          activeField,
          activeFieldLabel,
          fieldIrsReference,
          currentValues: mode === "scoped" ? currentValues : {},
          caseId,
          mode,
        }),
      })

      if (!res.ok) throw new Error("Failed to get response")
      const data = await res.json()
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't process that request. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        width: 320,
        borderLeft: "1px solid var(--c-gray-100)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--c-white, #ffffff)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--c-gray-100)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <JunebugIcon className="h-5 w-5" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--c-gray-900)",
            }}
          >
            Junebug
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setMode(mode === "scoped" ? "general" : "scoped")}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 99,
              border: "1px solid var(--c-gray-100)",
              background:
                mode === "general"
                  ? "var(--c-teal-soft, #e6f7f5)"
                  : "transparent",
              color:
                mode === "general"
                  ? "var(--c-teal)"
                  : "var(--c-gray-500)",
              cursor: "pointer",
            }}
          >
            {mode === "scoped" ? "Scoped" : "General"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--c-gray-300)",
              fontSize: 18,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Context indicator */}
      <div
        style={{
          padding: "8px 16px",
          fontSize: 11,
          color: "var(--c-gray-500)",
          background: "var(--c-snow, #fafafa)",
          borderBottom: "1px solid var(--c-gray-100)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {contextLabel}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--c-gray-300)",
              fontSize: 13,
              padding: "32px 16px",
            }}
          >
            <div style={{ margin: "0 auto 12px", opacity: 0.3, width: 32 }}>
              <JunebugIcon className="h-8 w-8" />
            </div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              Ask me about this form
            </div>
            <div style={{ fontSize: 11 }}>
              I know the IRS instructions, allowable expense standards, and your
              client&apos;s case data.
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              background:
                msg.role === "user"
                  ? "var(--c-navy-900, #1a2332)"
                  : "var(--c-gray-50, #f5f5f5)",
              color: msg.role === "user" ? "white" : "var(--c-gray-700)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "8px 12px",
              borderRadius: 12,
              background: "var(--c-gray-50, #f5f5f5)",
              fontSize: 13,
              color: "var(--c-gray-300)",
            }}
          >
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--c-gray-100)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={
            mode === "scoped"
              ? `Ask about ${activeFieldLabel || "this field"}...`
              : "Ask anything about this form..."
          }
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--c-gray-100)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--c-teal)",
            color: "white",
            fontSize: 12,
            fontWeight: 500,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            opacity: input.trim() && !loading ? 1 : 0.5,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
