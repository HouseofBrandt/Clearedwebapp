"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
} from "lucide-react"
import { DOCUMENT_CATEGORY_LABELS } from "@/types"

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

export function DocumentList({ documents }: DocumentListProps) {
  const router = useRouter()
  const { addToast } = useToast()

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
          <h3 className="mt-4 text-lg font-semibold">No documents</h3>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Documents ({documents.length})</CardTitle>
          <span className="text-sm text-muted-foreground">
            {docsWithText}/{documents.length} ready for AI analysis
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
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
            {documents.map((doc) => {
              const Icon = fileTypeIcons[doc.fileType] || File
              return (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{doc.fileName}</span>
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
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-xs">
                          {doc.extractedText.trim().length.toLocaleString()} chars
                        </span>
                      </div>
                    ) : doc.fileType === "IMAGE" ? (
                      <div className="flex items-center gap-1.5 text-amber-600" title="OCR did not find readable text in this image">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs">No text found (OCR)</span>
                      </div>
                    ) : doc.fileType === "PDF" ? (
                      <div className="flex items-center gap-1.5 text-amber-600" title="This PDF appears to be scanned (image-only). Searchable PDFs extract text automatically.">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs">Scanned PDF — no text</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
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
                    {new Date(doc.uploadedAt).toLocaleDateString()}
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
      </CardContent>
    </Card>
  )
}
