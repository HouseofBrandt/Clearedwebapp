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
import { useToast } from "@/components/ui/toast"
import { Upload, FileUp, X } from "lucide-react"
import { DOCUMENT_CATEGORY_LABELS } from "@/types"
import { autoDetectCategory } from "@/lib/documents/auto-category"

interface DocumentUploadProps {
  caseId: string
}

export function DocumentUpload({ caseId }: DocumentUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [fileCategories, setFileCategories] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const addFiles = useCallback((newFiles: File[]) => {
    const newCats = newFiles.map((f) => autoDetectCategory(f.name))
    setFiles((prev) => [...prev, ...newFiles])
    setFileCategories((prev) => [...prev, ...newCats])
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
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)

    try {
      let extractedCount = 0
      let failedFiles: { name: string; reason: string }[] = []

      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx]
        const formData = new FormData()
        formData.append("file", file)
        formData.append("caseId", caseId)
        formData.append("documentCategory", fileCategories[idx] || "OTHER")

        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }))
          failedFiles.push({ name: file.name, reason: err.error || "Upload failed" })
          continue
        }

        const result = await res.json()
        if (result.hasExtractedText) {
          extractedCount++
        } else {
          failedFiles.push({
            name: file.name,
            reason: result.extractionError || "No text could be extracted",
          })
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
      setFiles([])
      setFileCategories([])
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
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 border rounded-md px-3 py-2">
                  <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
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
                </div>
              ))}
            </div>

            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? "Uploading..." : `Upload ${files.length} file(s)`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
