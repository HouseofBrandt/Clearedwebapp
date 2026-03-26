"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/date-utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CheckSquare,
  ArrowUpDown,
  Clock,
} from "lucide-react"
import { DOCUMENT_CATEGORY_LABELS } from "@/types"
import { getFreshnessLabel } from "@/lib/case-intelligence/document-freshness"

const fileTypeIcons: Record<string, any> = {
  PDF: FileText,
  IMAGE: ImageIcon,
  DOCX: FileText,
  XLSX: FileSpreadsheet,
  TEXT: File,
}

interface DocumentListProps {
  documents: any[]
}

type SortField = "name" | "category" | "type" | "date"
type SortDir = "asc" | "desc"

export function DocumentList({ documents }: DocumentListProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [sortBy, setSortBy] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sortedDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case "name":
          cmp = (a.fileName || "").localeCompare(b.fileName || "")
          break
        case "category":
          cmp = (a.documentCategory || "").localeCompare(b.documentCategory || "")
          break
        case "type": {
          const extA = a.fileName?.split(".").pop()?.toLowerCase() || ""
          const extB = b.fileName?.split(".").pop()?.toLowerCase() || ""
          cmp = extA.localeCompare(extB)
          break
        }
        case "date":
          cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [documents, sortBy, sortDir])

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(field)
      setSortDir(field === "date" ? "desc" : "asc")
    }
  }

  function toggleDoc(docId: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  function toggleAll() {
    if (selectedDocs.size === documents.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(documents.map((d) => d.id)))
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedDocs.size} selected documents?`)) return

    setBulkDeleting(true)
    try {
      const res = await fetch("/api/documents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: Array.from(selectedDocs) }),
      })
      if (!res.ok) throw new Error("Failed")
      addToast({ title: `${selectedDocs.size} documents deleted` })
      setSelectedDocs(new Set())
      setSelectMode(false)
      router.refresh()
    } catch {
      addToast({ title: "Error", description: "Failed to delete documents", variant: "destructive" })
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleCategoryChange(docId: string, newCategory: string) {
    const res = await fetch(`/api/documents/${docId}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentCategory: newCategory }),
    })
    if (res.ok) {
      addToast({ title: "Category updated" })
      router.refresh()
    }
  }

  async function handleDelete(docId: string, fileName: string) {
    if (!confirm(`Delete ${fileName}?`)) return

    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      addToast({ title: "Document deleted" })
      router.refresh()
    } catch {
      addToast({ title: "Error", description: "Failed to delete document", variant: "destructive" })
    }
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No documents</h3>
          <p className="text-sm text-muted-foreground">
            Upload documents using the area above.
          </p>
        </CardContent>
      </Card>
    )
  }

  const docsWithText = documents.filter(
    (d) => d.extractedText && d.extractedText.trim().length > 0
  ).length

  const sortIndicator = (field: SortField) =>
    sortBy === field ? (sortDir === "asc" ? " \u2191" : " \u2193") : ""

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Documents ({documents.length})</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {docsWithText}/{documents.length} ready for AI
            </span>
            <Button
              variant={selectMode ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                if (selectMode) {
                  setSelectMode(false)
                  setSelectedDocs(new Set())
                } else {
                  setSelectMode(true)
                }
              }}
            >
              <CheckSquare className="mr-1.5 h-4 w-4" />
              {selectMode ? "Cancel" : "Select"}
            </Button>
          </div>
        </div>
        {/* Sort controls */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {(["name", "category", "type", "date"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                sortBy === field ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}{sortIndicator(field)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {selectMode && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={selectedDocs.size === documents.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-c-gray-200"
                  />
                </TableHead>
              )}
              <TableHead>File</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Text Extracted</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDocuments.map((doc) => {
              const Icon = fileTypeIcons[doc.fileType] || File
              return (
                <TableRow key={doc.id} className={selectedDocs.has(doc.id) ? "bg-muted/40" : undefined}>
                  {selectMode && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-c-gray-200"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{doc.fileName}</span>
                          {doc.freshnessStatus && (() => {
                            const { label, color } = getFreshnessLabel(doc.freshnessStatus)
                            if (!label) return null
                            const colorClasses =
                              color === "green" ? "bg-c-success-soft text-c-success" :
                              color === "yellow" ? "bg-yellow-100 text-yellow-800" :
                              color === "red" ? "bg-c-danger-soft text-c-danger" : ""
                            return (
                              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colorClasses}`}>
                                <Clock className="h-2.5 w-2.5" />
                                {label}
                              </span>
                            )
                          })()}
                        </div>
                        {doc.statementDate && (
                          <span className="text-[11px] text-muted-foreground">
                            Statement: {new Date(doc.statementDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={doc.documentCategory}
                      onValueChange={(v) => handleCategoryChange(doc.id, v)}>
                      <SelectTrigger className="h-7 w-[140px] text-xs border-0 bg-transparent hover:bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {doc.extractedText && doc.extractedText.trim().length > 0 ? (
                      <div className="flex items-center gap-1.5 text-c-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-xs">
                          {doc.extractedText.trim().length.toLocaleString()} chars
                        </span>
                      </div>
                    ) : doc.fileType === "IMAGE" ? (
                      <div className="flex items-center gap-1.5 text-c-warning" title="OCR did not find readable text in this image">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs">No text found (OCR)</span>
                      </div>
                    ) : doc.fileType === "PDF" ? (
                      <div className="flex items-center gap-1.5 text-c-warning" title="This PDF appears to be scanned (image-only). Searchable PDFs extract text automatically.">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs">Scanned PDF — no text</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-c-danger">
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="text-xs">No text extracted</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(doc.fileSize / 1024).toFixed(1)} KB
                  </TableCell>
                  <TableCell className="text-sm">{doc.uploadedBy?.name}</TableCell>
                  <TableCell className="text-sm">
                    {formatDate(doc.uploadedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id, doc.fileName)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Bulk action bar */}
        {selectMode && selectedDocs.size > 0 && (
          <div className="sticky bottom-0 mt-3 flex items-center justify-between rounded-lg border bg-background p-3">
            <span className="text-sm text-muted-foreground">
              {selectedDocs.size} selected
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedDocs(new Set()); setSelectMode(false) }}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? "Deleting..." : "Delete Selected"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
