export interface PDFFieldMapping {
  acroFieldName?: string
  coordinate?: { page: number; x: number; y: number; fontSize?: number; maxWidth?: number }
}

export interface PDFFieldMap {
  formNumber: string
  pdfFile: string
  strategy: "acroform" | "coordinate" | "hybrid"
  fields: Record<string, PDFFieldMapping>
}
