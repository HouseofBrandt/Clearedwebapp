"use client"

import { useState, useEffect, useRef, useCallback } from "react"

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

// PDF.js CDN URL
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174"

// Load PDF.js from CDN
function loadPDFJS(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib)
      return
    }
    const script = document.createElement("script")
    script.src = `${PDFJS_CDN}/pdf.min.js`
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
      resolve(pdfjsLib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function PDFFormPreview({ formNumber, instanceId, values, currentPage = 1 }: PDFFormPreviewProps) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("")
  const [generating, setGenerating] = useState(false)
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)
  const blobRef = useRef<string>("")
  const blankPdfUrl = FORM_PDF_MAP[formNumber] || ""

  const filledCount = Object.keys(values).filter(k =>
    values[k] !== undefined && values[k] !== "" && values[k] !== null
  ).length

  // POST values to generate filled PDF
  useEffect(() => {
    if (filledCount === 0) {
      setPdfBlobUrl("")
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
        }
      } catch {}
      finally { setGenerating(false) }
    }, 1500)
    return () => { clearTimeout(timer); setGenerating(false) }
  }, [values, formNumber, instanceId, filledCount])

  const renderPage = useCallback(async (pdf: any, num: number) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const page = await pdf.getPage(num)
    const containerWidth = container.offsetWidth - 16 // padding
    const viewport = page.getViewport({ scale: 1 })
    const scale = containerWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })

    canvas.height = scaledViewport.height
    canvas.width = scaledViewport.width

    const context = canvas.getContext("2d")
    if (!context) return

    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise
  }, [])

  const renderPDF = useCallback(async (url: string) => {
    try {
      setRendering(true)
      const pdfjsLib = await loadPDFJS()
      const loadingTask = pdfjsLib.getDocument(url)
      const pdf = await loadingTask.promise
      pdfDocRef.current = pdf
      setTotalPages(pdf.numPages)
      setPageNum(1)
      await renderPage(pdf, 1)
    } catch (err) {
      console.error("PDF render error:", err)
    } finally {
      setRendering(false)
    }
  }, [renderPage])

  // Load blank form initially via PDF.js
  useEffect(() => {
    if (!blankPdfUrl) return
    renderPDF(blankPdfUrl)
  }, [blankPdfUrl, renderPDF])

  // Re-render when filled PDF is ready
  useEffect(() => {
    if (pdfBlobUrl) renderPDF(pdfBlobUrl)
  }, [pdfBlobUrl, renderPDF])

  // Re-render when page changes
  useEffect(() => {
    if (pdfDocRef.current) renderPage(pdfDocRef.current, pageNum)
  }, [pageNum, renderPage])

  const openInNewTab = () => {
    window.open(pdfBlobUrl || blankPdfUrl, "_blank")
  }

  if (!blankPdfUrl) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        borderLeft: "1px solid var(--c-gray-100)", background: "var(--c-snow)",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ fontSize: 13, color: "var(--c-gray-500)" }}>
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
        padding: "6px 10px", borderBottom: "1px solid var(--c-gray-100)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "var(--c-white)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--c-gray-500)" }}>
          IRS Form {formNumber}
          {pdfBlobUrl && <span style={{ color: "var(--c-teal)", marginLeft: 4 }}>&#8226; with data</span>}
        </span>
        <button onClick={openInNewTab} style={{
          background: "none", border: "1px solid var(--c-gray-100)",
          padding: "2px 8px", borderRadius: 4, cursor: "pointer",
          fontSize: 10, color: "var(--c-gray-500)",
        }}>
          {pdfBlobUrl ? "Full view \u2197" : "Open \u2197"}
        </button>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div style={{
          padding: "4px 10px", borderBottom: "1px solid var(--c-gray-100)",
          display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
          background: "var(--c-white)", flexShrink: 0,
        }}>
          <button onClick={() => setPageNum(Math.max(1, pageNum - 1))} disabled={pageNum <= 1}
            style={{ background: "none", border: "none", cursor: pageNum > 1 ? "pointer" : "default", color: pageNum > 1 ? "var(--c-gray-700)" : "var(--c-gray-200)", fontSize: 12 }}>
            &#9664;
          </button>
          <span style={{ fontSize: 10, color: "var(--c-gray-500)" }}>
            Page {pageNum} of {totalPages}
          </span>
          <button onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))} disabled={pageNum >= totalPages}
            style={{ background: "none", border: "none", cursor: pageNum < totalPages ? "pointer" : "default", color: pageNum < totalPages ? "var(--c-gray-700)" : "var(--c-gray-200)", fontSize: 12 }}>
            &#9654;
          </button>
        </div>
      )}

      {/* Canvas rendering area */}
      <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: 8, position: "relative" }}>
        {rendering && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 12, color: "var(--c-gray-300)" }}>
            Loading...
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }} />
      </div>

      {/* Status bar */}
      {generating && (
        <div style={{
          padding: "6px 10px", borderTop: "1px solid var(--c-gray-100)",
          background: "var(--c-white)", flexShrink: 0,
          fontSize: 10, color: "var(--c-teal)", textAlign: "center",
        }}>
          Generating preview with your data...
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: "6px 10px", borderTop: "1px solid var(--c-gray-100)",
        textAlign: "center", background: "var(--c-white)", flexShrink: 0,
      }}>
        <button onClick={openInNewTab} style={{
          fontSize: 11, color: "var(--c-teal)", background: "none",
          border: "none", cursor: "pointer", fontWeight: 500,
        }}>
          {pdfBlobUrl ? "View Tax Form (with your data)" : "View Tax Form"}
        </button>
      </div>
    </div>
  )
}
