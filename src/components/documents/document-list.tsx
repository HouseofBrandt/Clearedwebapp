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
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File,
  Download,
  Trash2,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Documents ({documents.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Category</TableHead>
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
                    <Badge variant="outline">
                      {DOCUMENT_CATEGORY_LABELS[doc.documentCategory] || doc.documentCategory}
                    </Badge>
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
