"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/toast"
import { Upload, FileUp, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { DOCUMENT_CATEGORY_LABELS } from "@/types"
import { autoDetectCategory } from "@/lib/documents/auto-category"

interface FileUploadState {
  status: "pending" | "uploading" | "done" | "error"
  progress: number
  error?: string
}

interface DocumentUploadProps {
  caseId: string
}

export function DocumentUpload({ caseId }: DocumentUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [fileCategories, setFileCategories] = useState<string[]>([])
  const [fileStates, setFileStates] = useState<FileUploadState[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  function updateFileState(index: number, update: Partial<FileUploadState>) {
    setFileStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)))
  }

  const addFiles = useCallback((newFiles: File[]) => {
    const newCats = newFiles.map((f) => autoDetectCategory(f.name))
    const newStates = newFiles.map(() => ({ status: "pending" as const, progress: 0 }))
    setFiles((prev) => [...prev, ...newFiles])
    setFileCategories((prev) => [...prev, ...newCats])
    setFileStates((prev) => [...prev, ...newStates])
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setFileCategories((prev) => prev.filter((_, i) => i !== index))
    setFileStates((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)

    try {
      let extractedCount = 0
      let failedFiles: { name: string; reason: string }[] = []

      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx]
        updateFileState(idx, { status: "uploading", progress: 0 })

        const formData = new FormData()
        formData.append("file", file)
        formData.append("caseId", caseId)
        formData.append("documentCategory", fileCategories[idx] || "OTHER")

        // Use XHR for upload progress tracking
        try {
          const result = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open("POST", "/api/documents/upload")

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 90) // 0-90% for upload, 90-100% for server processing
                updateFileState(idx, { progress: pct })
              }
            }

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                updateFileState(idx, { progress: 100 })
                try {
                  resolve(JSON.parse(xhr.responseText))
                } catch {
                  resolve({})
                }
              } else {
                try {
                  const err = JSON.parse(xhr.responseText)
                  reject(new Error(err.error || "Upload failed"))
                } catch {
                  reject(new Error("Upload failed"))
                }
              }
            }

            xhr.onerror = () => reject(new Error("Upload failed"))
            xhr.send(formData)
          })

          updateFileState(idx, { status: "done", progress: 100 })

          if (result.hasExtractedText) {
            extractedCount++
          } else {
            failedFiles.push({
              name: file.name,
              reason: result.extractionError || "No text could be extracted",
            })
          }
        } catch (err: any) {
          updateFileState(idx, { status: "error", error: err.message })
          failedFiles.push({ name: file.name, reason: err.message })
        }
      }

      if (failedFiles.length > 0 && extractedCount > 0) {
        addToast({
          title: `${extractedCount}/${files.length} files processed`,
          description: `Text extraction failed for: ${failedFiles.map(f => f.name).join(", ")}`,
        })
      } else if (failedFiles.length > 0 && extractedCount === 0) {
        addToast({
          title: "Upload complete but no text extracted",
          description: failedFiles[0].reason,
          variant: "destructive",
        })
      } else {
        addToast({
          title: "Upload complete",
          description: `${files.length} file(s) uploaded and processed.`,
        })
      }
      router.refresh()
    } catch (error) {
      addToast({
        title: "Upload failed",
        description: "One or more files failed to upload.",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const overallProgress = uploading && fileStates.length > 0
    ? Math.round(fileStates.reduce((sum, s) => sum + s.progress, 0) / fileStates.length)
    : 0

  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            Drag and drop files here, or{" "}
            <label className="cursor-pointer text-primary underline">
              browse
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt,.csv"
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, Images, DOCX, XLSX, TXT up to 10MB each
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Overall progress when uploading multiple files */}
            {uploading && files.length > 1 && (
              <Progress
                value={overallProgress}
                size="md"
                showPercent
                label={`Uploading ${files.length} files...`}
              />
            )}

            <div className="space-y-2">
              {files.map((file, i) => {
                const state = fileStates[i] || { status: "pending", progress: 0 }
                return (
                  <div key={i} className="border rounded-md px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {state.status === "done" ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : state.status === "error" ? (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : state.status === "uploading" ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                      ) : (
                        <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      {state.status === "pending" && (
                        <>
                          <Select value={fileCategories[i] || "OTHER"}
                            onValueChange={(v) => {
                              const updated = [...fileCategories]
                              updated[i] = v
                              setFileCategories(updated)
                            }}>
                            <SelectTrigger className="w-[150px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            onClick={() => removeFile(i)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {state.status === "uploading" && (
                      <Progress value={state.progress} size="sm" showPercent />
                    )}
                    {state.status === "error" && state.error && (
                      <p className="text-xs text-destructive">{state.error}</p>
                    )}
                  </div>
                )
              })}
            </div>

            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                `Upload ${files.length} file(s)`
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
