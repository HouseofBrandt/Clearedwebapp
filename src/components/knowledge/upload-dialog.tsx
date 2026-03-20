"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Progress } from "@/components/ui/progress"
import { Plus, Loader2, Upload, X, FileText, CheckCircle, AlertCircle, CloudUpload } from "lucide-react"

const CATEGORIES = [
  { value: "IRC_STATUTE", label: "IRC Statute" },
  { value: "TREASURY_REGULATION", label: "Treasury Regulation" },
  { value: "IRM_SECTION", label: "IRM Section" },
  { value: "REVENUE_PROCEDURE", label: "Revenue Procedure" },
  { value: "REVENUE_RULING", label: "Revenue Ruling" },
  { value: "CASE_LAW", label: "Case Law" },
  { value: "TREATISE", label: "Treatise / Reference Book" },
  { value: "FIRM_TEMPLATE", label: "Firm Template" },
  { value: "WORK_PRODUCT", label: "Work Product" },
  { value: "FIRM_PROCEDURE", label: "Firm Procedure" },
  { value: "TRAINING_MATERIAL", label: "Training / CLE Material" },
  { value: "CLIENT_GUIDE", label: "Client Guide" },
  { value: "CUSTOM", label: "Custom" },
]

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.text,.rtf,.csv"
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

interface FileUploadItem {
  file: File
  title: string
  category: string
  description: string
  tags: string
  status: "pending" | "uploading" | "processing" | "done" | "error"
  progress: number
  progressPhase?: string
  error?: string
  documentId?: string
  chunksCreated?: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function guessCategory(fileName: string): string {
  const name = fileName.toLowerCase()
  if (name.includes("irm")) return "IRM_SECTION"
  if (name.includes("irc") || name.includes("section")) return "IRC_STATUTE"
  if (name.includes("reg")) return "TREASURY_REGULATION"
  if (name.includes("rev proc")) return "REVENUE_PROCEDURE"
  if (name.includes("template")) return "FIRM_TEMPLATE"
  if (name.includes("training") || name.includes("cle")) return "TRAINING_MATERIAL"
  return ""
}

export function UploadDialog() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [globalCategory, setGlobalCategory] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { addToast } = useToast()

  function addFiles(newFiles: FileList | File[]) {
    const items: FileUploadItem[] = Array.from(newFiles)
      .filter((f) => f.size <= MAX_FILE_SIZE)
      .map((f) => ({
        file: f,
        title: f.name.replace(/\.[^.]+$/, ""),
        category: globalCategory || guessCategory(f.name),
        description: "",
        tags: "",
        status: "pending" as const,
        progress: 0,
      }))

    const oversized = Array.from(newFiles).filter((f) => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      addToast({
        title: "Files too large",
        description: `${oversized.length} file(s) exceeded the 500MB limit and were skipped.`,
        variant: "destructive",
      })
    }

    setFiles((prev) => [...prev, ...items])
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function updateFile(index: number, updates: Partial<FileUploadItem>) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)))
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalCategory])

  /**
   * Upload via FormData directly to the server (fallback when S3 isn't available).
   * Works for files within the serverless body size limit (~10MB).
   */
  async function uploadViaFormData(item: FileUploadItem, index: number) {
    updateFile(index, { status: "uploading", progress: 50 })

    const formData = new FormData()
    formData.append("file", item.file)
    formData.append("title", item.title)
    formData.append("category", item.category)
    if (item.description) formData.append("description", item.description)
    if (item.tags) {
      const tags = item.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      formData.append("tags", JSON.stringify(tags))
    }

    const res = await fetch("/api/knowledge", {
      method: "POST",
      body: formData,
    })

    updateFile(index, { progress: 100 })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Upload failed")
    }

    const result = await res.json()
    updateFile(index, {
      status: "done",
      documentId: result.id,
      chunksCreated: result.chunksCreated,
      error: result.warning,
    })
  }

  async function uploadSingleFile(item: FileUploadItem, index: number) {
    if (!item.category) {
      updateFile(index, { status: "error", error: "Category is required" })
      return
    }

    try {
      // Step 1: Get presigned URL
      updateFile(index, { status: "uploading", progress: 0 })

      const presignRes = await fetch("/api/knowledge/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: item.file.name,
          fileType: item.file.type || "application/octet-stream",
          fileSize: item.file.size,
          title: item.title,
          category: item.category,
          description: item.description || undefined,
          tags: item.tags
            ? item.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
            : [],
        }),
      })

      if (!presignRes.ok) {
        // S3 presign failed — fall back to direct FormData upload for small files
        const presignErr = await presignRes.json().catch(() => ({}))
        const s3NotConfigured = presignRes.status === 503
        console.warn("[KB Upload] Presign failed:", presignErr.error || presignRes.status)

        // Direct upload only works for files under ~4.5MB (Vercel serverless limit)
        const DIRECT_UPLOAD_LIMIT = 4.5 * 1024 * 1024
        if (item.file.size > DIRECT_UPLOAD_LIMIT) {
          throw new Error(
            s3NotConfigured
              ? `File is too large for direct upload (${formatFileSize(item.file.size)}). S3 storage must be configured for files over 4.5MB. Contact your administrator.`
              : presignErr.error || "Failed to get upload URL"
          )
        }

        await uploadViaFormData(item, index)
        return
      }

      const { documentId, uploadUrl } = await presignRes.json()
      updateFile(index, { documentId })

      // Step 2: Upload directly to S3 with progress
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("PUT", uploadUrl)
          xhr.setRequestHeader("Content-Type", item.file.type || "application/octet-stream")

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              updateFile(index, { progress: pct })
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else if (xhr.status === 403) {
              reject(new Error("S3 upload rejected (403 Forbidden). Check S3 bucket policy and IAM credentials."))
            } else if (xhr.status === 0) {
              reject(new Error("S3 upload blocked by browser (CORS). The S3 bucket needs a CORS policy allowing PUT requests from this domain."))
            } else {
              reject(new Error(`S3 upload failed (HTTP ${xhr.status}). ${xhr.responseText?.slice(0, 200) || ""}`))
            }
          }

          xhr.onerror = () => reject(new Error("S3 upload blocked by browser (likely CORS). The S3 bucket needs a CORS configuration allowing PUT from this domain."))
          xhr.send(item.file)
        })
      } catch (s3Error: any) {
        // S3 upload failed (CORS, credentials, etc.) — fall back to direct upload for small files
        console.warn("[KB Upload] S3 upload failed, falling back to direct upload:", s3Error)
        const DIRECT_UPLOAD_LIMIT = 4.5 * 1024 * 1024
        if (item.file.size > DIRECT_UPLOAD_LIMIT) {
          // For large files, surface the S3 error directly — FormData fallback won't work
          throw s3Error
        }
        await uploadViaFormData(item, index)
        return
      }

      // Step 3: Trigger server-side processing (streamed progress)
      updateFile(index, { status: "processing", progress: 0, progressPhase: "Starting processing..." })

      const processRes = await fetch("/api/knowledge/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      })

      if (!processRes.ok) {
        const err = await processRes.json().catch(() => ({}))
        throw new Error(err.error || "Processing failed")
      }

      // Read streamed progress events
      const reader = processRes.body!.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split("\n")
        lineBuffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.status === "processing") {
              updateFile(index, {
                progress: data.percent ?? 0,
                progressPhase: data.phase || "Processing...",
              })
            } else if (data.status === "complete") {
              updateFile(index, {
                status: "done",
                progress: 100,
                chunksCreated: data.chunksCreated,
                error: data.warning,
              })
            } else if (data.status === "error") {
              throw new Error(data.error || "Processing failed")
            }
          } catch (e: any) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }
      // Process remaining buffer
      if (lineBuffer.trim()) {
        try {
          const data = JSON.parse(lineBuffer)
          if (data.status === "complete") {
            updateFile(index, {
              status: "done",
              progress: 100,
              chunksCreated: data.chunksCreated,
              error: data.warning,
            })
          } else if (data.status === "error") {
            throw new Error(data.error || "Processing failed")
          }
        } catch (e: any) {
          if (!(e instanceof SyntaxError)) throw e
        }
      }
    } catch (err: any) {
      updateFile(index, { status: "error", error: err.message })
    }
  }

  async function handleUploadAll() {
    const pending = files.filter((f) => f.status === "pending" || f.status === "error")
    if (pending.length === 0) return

    setIsUploading(true)

    // Upload up to 3 files concurrently
    const concurrency = 3
    const queue = files
      .map((f, i) => [i, f] as [number, FileUploadItem])
      .filter(([, f]) => f.status === "pending" || f.status === "error")

    const runNext = async (): Promise<void> => {
      const next = queue.shift()
      if (!next) return
      const [index, item] = next
      await uploadSingleFile(item, index)
      await runNext()
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => runNext()))

    setIsUploading(false)
    router.refresh()

    const results = files.filter((f) => f.status === "done")
    const errors = files.filter((f) => f.status === "error")
    if (results.length > 0) {
      addToast({
        title: `${results.length} document(s) uploaded`,
        description: errors.length > 0 ? `${errors.length} failed — check details below.` : undefined,
      })
    }
  }

  function resetAndClose() {
    setFiles([])
    setGlobalCategory("")
    setOpen(false)
  }

  const pendingCount = files.filter((f) => f.status === "pending" || f.status === "error").length
  const allDone = files.length > 0 && files.every((f) => f.status === "done" || f.status === "error")

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && isUploading) return // prevent closing during upload
        setOpen(v)
        if (!v) { setFiles([]); setGlobalCategory("") }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Add Knowledge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload to Knowledge Base</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          <CloudUpload className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">
            Drop files here or click to browse
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX, XLSX, TXT, CSV, RTF — up to 500MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>

        {/* Global category selector */}
        {files.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Category for all:</Label>
            <Select
              value={globalCategory}
              onValueChange={(v) => {
                setGlobalCategory(v)
                setFiles((prev) =>
                  prev.map((f) => (f.status === "pending" ? { ...f, category: v } : f))
                )
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Set for all" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-3 max-h-[40vh] overflow-y-auto">
            {files.map((item, index) => (
              <div
                key={index}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.title}
                        onChange={(e) => updateFile(index, { title: e.target.value })}
                        className="h-7 text-sm font-medium"
                        disabled={item.status !== "pending"}
                        placeholder="Document title"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={item.category}
                        onValueChange={(v) => updateFile(index, { category: v })}
                        disabled={item.status !== "pending"}
                      >
                        <SelectTrigger className="h-7 w-[160px] text-xs">
                          <SelectValue placeholder="Category *" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={item.tags}
                        onChange={(e) => updateFile(index, { tags: e.target.value })}
                        className="h-7 text-xs flex-1"
                        disabled={item.status !== "pending"}
                        placeholder="Tags (comma-separated)"
                      />
                    </div>
                  </div>
                  {item.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  {item.status === "done" && (
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                </div>

                {/* Progress bar */}
                {(item.status === "uploading" || item.status === "processing") && (
                  <Progress
                    value={item.progress}
                    size="sm"
                    variant={item.status === "processing" ? "warning" : "default"}
                    showPercent
                    label={
                      item.status === "uploading"
                        ? "Uploading to storage..."
                        : item.progressPhase || "Processing..."
                    }
                  />
                )}

                {/* Result info */}
                {item.status === "done" && item.chunksCreated != null && (
                  <p className="text-xs text-green-700">
                    {item.chunksCreated} chunks created
                    {item.error && ` — ${item.error}`}
                  </p>
                )}

                {/* Error */}
                {item.status === "error" && item.error && (
                  <p className="text-xs text-destructive">{item.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Large file warning */}
        {files.some((f) => f.file.size > 10 * 1024 * 1024 && f.status === "pending") && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Large files may take several minutes to process. If embedding fails due to rate limits, you can backfill embeddings later from the document&apos;s menu.
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-muted-foreground">
            {files.length > 0
              ? `${files.length} file(s) selected — ${formatFileSize(files.reduce((s, f) => s + f.file.size, 0))} total`
              : "No files selected"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={resetAndClose}
              disabled={isUploading}
            >
              {allDone ? "Close" : "Cancel"}
            </Button>
            {!allDone && (
              <Button
                onClick={handleUploadAll}
                disabled={isUploading || pendingCount === 0}
              >
                {isUploading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-4 w-4" />
                )}
                Upload {pendingCount > 0 ? `${pendingCount} File${pendingCount > 1 ? "s" : ""}` : ""}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
