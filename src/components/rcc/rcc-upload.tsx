"use client"

import { useState, useRef } from "react"
import { Upload, X, Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TaxpayerInfo } from "./cleared-rcc"

interface RCCUploadProps {
  onParseComplete: (taxpayer: TaxpayerInfo | null, years: Record<string, any>) => void
}

export function RCCUpload({ onParseComplete }: RCCUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [parsing, setParsing] = useState(false)
  const [parseStatus, setParseStatus] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf")
    setFiles((prev) => [...prev, ...newFiles])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const newFiles = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf")
    setFiles((prev) => [...prev, ...newFiles])
  }

  async function readFileBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve((r.result as string).split(",")[1])
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }

  async function handleParse() {
    if (!files.length) return
    setParsing(true)
    setParseStatus("Reading files...")

    try {
      // Read all files to base64
      const fileContents = await Promise.all(
        files.map(async (f) => ({
          data: await readFileBase64(f),
          mediaType: "application/pdf",
        }))
      )

      setParseStatus("Sending to AI for analysis...")

      // Call server-side API to parse
      const res = await fetch("/api/rcc/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: fileContents }),
      })

      if (!res.ok) {
        throw new Error("Parse API failed")
      }

      const result = await res.json()
      setParseStatus("Complete!")
      onParseComplete(result.taxpayer, result.years)
    } catch (e: any) {
      setParseStatus(`Error: ${e.message}`)
    }
    setParsing(false)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-medium text-c-gray-900 dark:text-c-gray-100 mb-1">
        Upload IRS Transcripts
      </h2>
      <p className="text-sm text-c-gray-500 mb-6">
        Upload Wage & Income, Account, and Tax Return transcripts. The system will parse all
        documents and build a complete compliance profile.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-c-gray-200 dark:border-c-gray-500 rounded-xl p-12 text-center cursor-pointer hover:border-c-gray-300 dark:hover:border-c-gray-500 transition-colors mb-5"
      >
        <Upload className="h-10 w-10 text-c-gray-300 mx-auto mb-3" />
        <div className="text-sm font-medium text-c-gray-500 dark:text-c-gray-300">
          Drop PDF transcripts here or click to browse
        </div>
        <div className="text-xs text-c-gray-300 mt-1">Supports all IRS transcript types</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFiles}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-medium text-c-gray-500 dark:text-c-gray-300 mb-2">
            {files.length} file(s) selected:
          </div>
          <div className="max-h-48 overflow-auto border border-c-gray-100 dark:border-c-gray-700 rounded-lg">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 text-xs border-b border-c-gray-100 dark:border-c-gray-700 last:border-0"
              >
                <div className="flex items-center gap-2 text-c-gray-500 dark:text-c-gray-300">
                  <FileText className="h-3.5 w-3.5 text-c-gray-300" />
                  <span className="font-mono">{f.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setFiles((prev) => prev.filter((_, j) => j !== i))
                  }}
                  className="text-c-danger hover:text-c-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleParse}
          disabled={!files.length || parsing}
          className="bg-c-gray-900 text-white hover:bg-c-gray-900 dark:bg-c-gray-100 dark:text-c-gray-900"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Parsing...
            </>
          ) : (
            "Analyze Transcripts"
          )}
        </Button>
        {parseStatus && (
          <span
            className={`text-sm ${
              parseStatus.startsWith("Error") ? "text-c-danger" : "text-c-gray-500"
            }`}
          >
            {parseStatus}
          </span>
        )}
      </div>

      {/* Help */}
      <div className="mt-8 p-5 bg-c-warning-soft dark:bg-c-warning/20 rounded-lg border border-c-warning/20 dark:border-c-warning/30/50">
        <div className="text-sm font-medium text-c-warning dark:text-c-warning mb-2">
          Supported Transcript Types
        </div>
        <div className="text-xs text-c-warning dark:text-c-warning leading-relaxed space-y-1">
          <p>
            <strong>Wage & Income Transcript</strong> — W-2, 1099-R, SSA-1099, 1099-INT, 1099-MISC,
            1099-NEC, 1098, etc.
          </p>
          <p>
            <strong>Account Transcript</strong> — Transaction codes, balances, filing status,
            penalties, refunds, liens, SFR/ASFR
          </p>
          <p>
            <strong>Tax Return Transcript</strong> — Filed return data: AGI, taxable income, credits,
            payments
          </p>
        </div>
      </div>
    </div>
  )
}
