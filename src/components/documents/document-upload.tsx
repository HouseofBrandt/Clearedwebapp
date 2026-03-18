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

interface DocumentUploadProps {
  caseId: string
}

export function DocumentUpload({ caseId }: DocumentUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState("OTHER")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...droppedFiles])
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)

    try {
      let extractedCount = 0
      let failedExtraction: string[] = []

      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("caseId", caseId)
        formData.append("documentCategory", category)

        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) throw new Error(`Failed to upload ${file.name}`)

        const result = await res.json()
        if (result.hasExtractedText) {
          extractedCount++
        } else {
          failedExtraction.push(file.name)
        }
      }

      if (failedExtraction.length > 0) {
        addToast({
          title: "Upload complete — some files need attention",
          description: `${extractedCount}/${files.length} files had text extracted. Failed: ${failedExtraction.join(", ")}`,
          variant: failedExtraction.length === files.length ? "destructive" : "default",
        })
      } else {
        addToast({
          title: "Upload complete",
          description: `${files.length} file(s) uploaded with text extracted.`,
        })
      }
      setFiles([])
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
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : `Upload ${files.length} file(s)`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
