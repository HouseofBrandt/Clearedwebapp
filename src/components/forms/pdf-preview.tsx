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
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("")
  const blankPdfUrl = FORM_PDF_MAP[formNumber] || ""

  // Debounce: POST values to generate filled PDF when values change
  useEffect(() => {
    const hasValues = Object.keys(values).some(k => values[k] !== undefined && values[k] !== "" && values[k] !== null)
    if (!hasValues) {
      setPdfBlobUrl(blankPdfUrl)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/forms/${instanceId}/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formNumber, values }),
        })
        if (res.ok) {
          const blob = await res.blob()
          // Convert to data URL — blob: URLs don't render in Chrome's PDF viewer
          // inside embed/iframe, but data: URLs do
          const reader = new FileReader()
          reader.onloadend = () => {
            const dataUrl = reader.result as string
            setPdfBlobUrl(dataUrl)
          }
          reader.readAsDataURL(blob)
        }
      } catch {
        // Fall back to blank form
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [values, formNumber, instanceId, blankPdfUrl])

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

  const displayUrl = pdfBlobUrl || blankPdfUrl

  const headerLabel = pdfBlobUrl && pdfBlobUrl.startsWith("blob:")
    ? `IRS Form ${formNumber} (with your data)`
    : `IRS Form ${formNumber}`

  // Open PDF in new tab for full-screen viewing
  const openInNewTab = () => {
    if (pdfBlobUrl && (pdfBlobUrl.startsWith("blob:") || pdfBlobUrl.startsWith("data:"))) {
      window.open(pdfBlobUrl, "_blank")
    } else {
      window.open(blankPdfUrl, "_blank")
    }
  }

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
            <button
              onClick={openInNewTab}
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.2)",
                color: "white", padding: "4px 12px", borderRadius: 6,
                cursor: "pointer", fontSize: 12,
              }}
            >
              Open in new tab ↗
            </button>
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
        <embed
          src={`${displayUrl}#page=${currentPage}`}
          type="application/pdf"
          style={{ flex: 1, width: "100%", border: "none" }}
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

      {/* PDF embed — shows the filled PDF */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <embed
          key={displayUrl}
          src={`${displayUrl}#page=${currentPage}`}
          type="application/pdf"
          style={{ width: "100%", height: "100%", border: "none" }}
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
