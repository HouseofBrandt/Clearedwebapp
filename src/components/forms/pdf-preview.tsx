"use client"

import { useState, useEffect } from "react"

interface PDFFormPreviewProps {
  formNumber: string
  instanceId: string
  values: Record<string, any>
  currentPage?: number
}

const FORM_PDF_MAP: Record<string, string> = {
  "433-A": "/forms/f433a.pdf",
  "433-A-OIC": "/forms/f433aoic.pdf",
  "12153": "/forms/f12153.pdf",
  "911": "/forms/f911.pdf",
}

export function PDFFormPreview({ formNumber, instanceId, values, currentPage = 1 }: PDFFormPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const blankPdfUrl = FORM_PDF_MAP[formNumber] || ""

  // Debounce: regenerate the filled PDF preview when values change
  useEffect(() => {
    const timer = setTimeout(() => {
      setRefreshKey((prev) => prev + 1)
    }, 1500) // Wait 1.5s after last value change before regenerating
    return () => clearTimeout(timer)
  }, [values])

  if (!blankPdfUrl) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        borderLeft: "1px solid var(--c-gray-100)", background: "var(--c-snow)",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ fontSize: 13, color: "var(--c-gray-500)", textAlign: "center" }}>
          PDF preview not available for Form {formNumber}
        </div>
      </div>
    )
  }

  // Use the filled preview endpoint if we have an instanceId, otherwise blank form
  const displayUrl = instanceId
    ? `/api/forms/${instanceId}/preview-pdf?t=${refreshKey}`
    : blankPdfUrl

  const headerLabel = instanceId
    ? `IRS Form ${formNumber} (with your data)`
    : `IRS Form ${formNumber} (blank)`

  if (isExpanded) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 50, background: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "8px 16px", background: "var(--c-gray-900)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "white", fontSize: 13, fontWeight: 500 }}>
            {headerLabel}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.2)",
                color: "white", padding: "4px 12px", borderRadius: 6,
                cursor: "pointer", fontSize: 12, textDecoration: "none",
              }}
            >
              Download ↓
            </a>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.2)",
                color: "white", padding: "4px 12px", borderRadius: 6,
                cursor: "pointer", fontSize: 12,
              }}
            >
              Close
            </button>
          </div>
        </div>
        <iframe
          src={`${displayUrl}#page=${currentPage}`}
          style={{ flex: 1, width: "100%", border: "none" }}
          title={`IRS Form ${formNumber}`}
        />
      </div>
    )
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      borderLeft: "1px solid var(--c-gray-100)", background: "var(--c-snow)",
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--c-gray-100)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "var(--c-white)",
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--c-gray-500)" }}>
          IRS Form {formNumber}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "none", border: "1px solid var(--c-gray-100)",
              padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              fontSize: 10, color: "var(--c-gray-500)", textDecoration: "none",
            }}
          >
            Open ↗
          </a>
          <button
            onClick={() => setIsExpanded(true)}
            style={{
              background: "none", border: "1px solid var(--c-gray-100)",
              padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              fontSize: 10, color: "var(--c-gray-500)",
            }}
          >
            Expand
          </button>
        </div>
      </div>

      {/* PDF iframe — shows the filled PDF from our API */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <iframe
          key={refreshKey}
          src={`${displayUrl}#page=${currentPage}`}
          style={{ width: "100%", height: "100%", border: "none" }}
          title={`IRS Form ${formNumber} Preview`}
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 12px", borderTop: "1px solid var(--c-gray-100)",
        textAlign: "center", background: "var(--c-white)",
      }}>
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            fontSize: 11, color: "var(--c-teal)", background: "none",
            border: "none", cursor: "pointer", fontWeight: 500,
          }}
        >
          View Tax Form
        </button>
      </div>
    </div>
  )
}
