"use client"

import { useState, useEffect, useRef } from "react"

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
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("")
  const [generating, setGenerating] = useState(false)
  const [lastFilled, setLastFilled] = useState(0)
  const blobRef = useRef<string>("")
  const blankPdfUrl = FORM_PDF_MAP[formNumber] || ""

  // Count filled values
  const filledCount = Object.keys(values).filter(k => values[k] !== undefined && values[k] !== "" && values[k] !== null).length

  // Debounce: POST values to generate filled PDF
  useEffect(() => {
    if (filledCount === 0) {
      setPdfBlobUrl("")
      setLastFilled(0)
      return
    }

    setGenerating(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/forms/${instanceId}/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formNumber, values }),
        })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          if (blobRef.current) URL.revokeObjectURL(blobRef.current)
          blobRef.current = url
          setPdfBlobUrl(url)
          setLastFilled(filledCount)
        }
      } catch {
        // Silently fail
      } finally {
        setGenerating(false)
      }
    }, 1500)
    return () => { clearTimeout(timer); setGenerating(false) }
  }, [values, formNumber, instanceId, filledCount])

  // Open filled PDF in new tab
  const viewFilledPDF = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, "_blank")
    } else {
      window.open(blankPdfUrl, "_blank")
    }
  }

  // Open blank form in new tab
  const viewBlankForm = () => {
    window.open(blankPdfUrl, "_blank")
  }

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
        <button
          onClick={viewBlankForm}
          style={{
            background: "none", border: "1px solid var(--c-gray-100)",
            padding: "2px 8px", borderRadius: 4, cursor: "pointer",
            fontSize: 10, color: "var(--c-gray-500)",
          }}
        >
          Blank form ↗
        </button>
      </div>

      {/* PDF thumbnail — show the blank form as a static preview */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <iframe
          src={`${blankPdfUrl}#page=${currentPage}`}
          style={{ width: "100%", height: "100%", border: "none" }}
          title={`IRS Form ${formNumber}`}
        />

        {/* Overlay with fill status */}
        {filledCount > 0 && (
          <div style={{
            position: "absolute", bottom: 8, left: 8, right: 8,
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
            borderRadius: 8, padding: "8px 12px",
            display: "flex", flexDirection: "column", gap: 6,
            zIndex: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "white" }}>
              {generating ? "Generating preview..." : `${lastFilled} fields filled`}
            </div>
            <button
              onClick={viewFilledPDF}
              disabled={generating || !pdfBlobUrl}
              style={{
                padding: "6px 0", borderRadius: 6, border: "none",
                background: pdfBlobUrl ? "var(--c-teal)" : "rgba(255,255,255,0.2)",
                color: "white", fontSize: 11, fontWeight: 500,
                cursor: pdfBlobUrl ? "pointer" : "wait",
                opacity: generating ? 0.6 : 1,
                width: "100%",
              }}
            >
              {generating ? "Generating..." : "View with your data ↗"}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 12px", borderTop: "1px solid var(--c-gray-100)",
        textAlign: "center", background: "var(--c-white)",
      }}>
        <button
          onClick={viewFilledPDF}
          style={{
            fontSize: 11, color: "var(--c-teal)", background: "none",
            border: "none", cursor: "pointer", fontWeight: 500,
          }}
        >
          {pdfBlobUrl ? "View Tax Form (with your data)" : "View Tax Form"}
        </button>
      </div>
    </div>
  )
}
