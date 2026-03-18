"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File,
  ChevronLeft,
  Eye,
} from "lucide-react"
import { DOCUMENT_CATEGORY_LABELS } from "@/types"

const fileTypeIcons: Record<string, any> = {
  PDF: FileText,
  IMAGE: ImageIcon,
  DOCX: FileText,
  XLSX: FileSpreadsheet,
  TEXT: File,
}

interface Document {
  id: string
  fileName: string
  fileType: string
  documentCategory: string
  extractedText: string | null
  fileSize: number
  uploadedAt: string
}

interface DocumentViewerPanelProps {
  documents: Document[]
}

export function DocumentViewerPanel({ documents }: DocumentViewerPanelProps) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)

  if (documents.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No source documents</p>
        </CardContent>
      </Card>
    )
  }

  if (selectedDoc) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDoc(null)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm truncate">{selectedDoc.fileName}</CardTitle>
              <Badge variant="outline" className="mt-1 text-xs">
                {DOCUMENT_CATEGORY_LABELS[selectedDoc.documentCategory as keyof typeof DOCUMENT_CATEGORY_LABELS] || selectedDoc.documentCategory}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          {selectedDoc.fileType === "PDF" ? (
            <iframe
              src={`/api/documents/${selectedDoc.id}`}
              className="w-full h-full min-h-[500px] border-0"
              title={selectedDoc.fileName}
            />
          ) : selectedDoc.fileType === "IMAGE" ? (
            <div className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/documents/${selectedDoc.id}`}
                alt={selectedDoc.fileName}
                className="max-w-full rounded border"
              />
            </div>
          ) : null}
          {selectedDoc.extractedText && (
            <div className="overflow-y-auto max-h-[600px]">
              <div className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Extracted Text</h4>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 rounded p-3">
                  {selectedDoc.extractedText}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Source Documents ({documents.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="overflow-y-auto max-h-[700px]">
          <div className="divide-y">
            {documents.map((doc) => {
              const Icon = fileTypeIcons[doc.fileType] || File
              const hasText = doc.extractedText && doc.extractedText.trim().length > 0
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {DOCUMENT_CATEGORY_LABELS[doc.documentCategory as keyof typeof DOCUMENT_CATEGORY_LABELS] || doc.documentCategory}
                      </Badge>
                      {hasText && (
                        <span className="text-[10px] text-green-600">
                          {doc.extractedText!.trim().length.toLocaleString()} chars
                        </span>
                      )}
                    </div>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
