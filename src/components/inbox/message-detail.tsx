"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface ExportDialogProps {
  open: boolean
  onClose: () => void
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const [include, setInclude] = useState<"BUG_REPORT" | "FEATURE_REQUEST" | "BOTH">("BOTH")
  const [days, setDays] = useState("30")
  const [format, setFormat] = useState<"markdown" | "json">("markdown")
  const [includeResolved, setIncludeResolved] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all")
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams()
      if (include !== "BOTH") params.set("type", include)
      if (days !== "0") params.set("days", days)
      params.set("format", format)
      if (includeResolved) params.set("includeResolved", "true")
      if (includeArchived) params.set("includeArchived", "true")
      if (readFilter !== "all") params.set("readFilter", readFilter)

      const res = await fetch(`/api/messages/export?${params.toString()}`)
      if (!res.ok) throw new Error("Export failed")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cleared-messages-export.${format === "markdown" ? "md" : "json"}`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      alert("Export failed. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  const includeOptions: { key: typeof include; label: string }[] = [
    { key: "BUG_REPORT", label: "Bug Reports" },
    { key: "FEATURE_REQUEST", label: "Feature Requests" },
    { key: "BOTH", label: "Both" },
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Messages</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Export bug reports and feature requests as a file you can give directly to a developer or AI tool.
        </p>

        <div className="space-y-4">
          {/* Include filter */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Include</label>
            <div className="flex gap-1.5">
              {includeOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setInclude(opt.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    include === opt.key
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Time range</label>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="0">All time</option>
            </select>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Format</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  checked={format === "markdown"}
                  onChange={() => setFormat("markdown")}
                  className="accent-primary"
                />
                Markdown (for Claude / Claude Code)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  checked={format === "json"}
                  onChange={() => setFormat("json")}
                  className="accent-primary"
                />
                JSON (structured data)
              </label>
            </div>
          </div>

          {/* Read/Unread filter */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Message status</label>
            <div className="flex gap-1.5">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "unread", label: "Unread" },
                  { key: "read", label: "Read" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setReadFilter(opt.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    readFilter === opt.key
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include resolved */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeResolved"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                className="accent-primary"
              />
              <label htmlFor="includeResolved" className="text-sm">
                Include implemented / resolved items
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeArchived"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="accent-primary"
              />
              <label htmlFor="includeArchived" className="text-sm">
                Include archived items
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={downloading}>
            <Download className="mr-1.5 h-4 w-4" />
            {downloading ? "Downloading..." : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
