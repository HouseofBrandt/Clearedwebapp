interface ChunkOptions {
  maxChunkSize?: number
  overlap?: number
  respectHeaders?: boolean
}

interface Chunk {
  chunkIndex: number
  content: string
  sectionHeader?: string
  metadata?: Record<string, any>
}

// Common section header patterns in tax documents
const HEADER_PATTERNS = [
  /^#{1,4}\s+(.+)$/m,                           // Markdown headers
  /^(?:SECTION|CHAPTER|PART)\s+[\dIVXLC]+[.:]\s*(.+)/im,  // SECTION 1: Title
  /^(?:IRC|IRM)\s*§?\s*[\d.]+/im,               // IRC § 6651 or IRM 5.8.5
  /^\d+\.\d+(?:\.\d+)*\s+/m,                    // Numbered sections like 5.8.5.2
  /^[A-Z][A-Z\s]{3,}$/m,                        // ALL CAPS headers
  /^(?:\d+\.)\s+[A-Z]/m,                        // "1. OVERVIEW" style
]

function detectSectionHeader(text: string): string | undefined {
  const firstLine = text.split("\n")[0].trim()
  for (const pattern of HEADER_PATTERNS) {
    if (pattern.test(firstLine)) {
      return firstLine.substring(0, 200)
    }
  }
  return undefined
}

export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const { maxChunkSize = 2000, overlap = 200, respectHeaders = true } = options
  const chunks: Chunk[] = []

  if (!text || text.trim().length === 0) return chunks

  // Split by section headers if present
  let sections: string[]
  if (respectHeaders) {
    // Split on double newlines followed by a header-like pattern
    sections = text.split(/\n{2,}(?=(?:#{1,4}\s|SECTION|CHAPTER|PART|\d+\.\d+|[A-Z]{4,}|IRC|IRM))/i)
    if (sections.length <= 1) {
      // No headers found — fall back to paragraph splitting
      sections = text.split(/\n{2,}/)
    }
  } else {
    sections = text.split(/\n{2,}/)
  }

  let currentChunk = ""
  let currentHeader: string | undefined

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    const header = detectSectionHeader(trimmed)
    if (header) currentHeader = header

    // If adding this section would exceed max size, save current chunk
    if (currentChunk.length + trimmed.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        content: currentChunk.trim(),
        sectionHeader: currentHeader,
      })

      // Start new chunk with overlap from the end of previous
      if (overlap > 0 && currentChunk.length > overlap) {
        const overlapText = currentChunk.slice(-overlap)
        const overlapBreak = overlapText.indexOf(" ")
        currentChunk = overlapBreak > 0 ? overlapText.slice(overlapBreak + 1) : overlapText
      } else {
        currentChunk = ""
      }
    }

    // If a single section is too large, split it by sentences
    if (trimmed.length > maxChunkSize) {
      const sentences = trimmed.match(/[^.!?\n]+[.!?\n]+/g) || [trimmed]
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          chunks.push({
            chunkIndex: chunks.length,
            content: currentChunk.trim(),
            sectionHeader: currentHeader,
          })
          currentChunk = ""
        }
        currentChunk += sentence
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 50) {
    chunks.push({
      chunkIndex: chunks.length,
      content: currentChunk.trim(),
      sectionHeader: currentHeader,
    })
  }

  return chunks
}
