/**
 * Legal-aware chunking engine for tax authority documents.
 *
 * Respects structural boundaries (sections, subsections) and never splits
 * mid-sentence. Produces chunks sized for embedding with metadata for
 * authority-weighted retrieval.
 */

import { createHash } from 'crypto'
import type { ParsedSection } from '../parse/base-parser'
import type { ChunkMetadata, AuthorityStatus, AuthorityTier, PrecedentialStatus } from '../types'
import { CHUNK_LIMITS } from '../constants'
import { countTokens } from './token-counter'

export interface ChunkOutput {
  content: string
  metadata: ChunkMetadata
  chunkIndex: number
}

// ─── Sentence splitting ─────────────────────────────────────────────────────

/**
 * Split text into sentences. Boundaries fall on ". " followed by an uppercase
 * letter, or end-of-text. Preserves the period with the preceding sentence.
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = []
  // Match sentence-ending patterns: period/question/exclamation followed by
  // whitespace and an uppercase letter (or end of string)
  const re = /[.!?](?:\s+(?=[A-Z])|\s*$)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].trimEnd().length
    const sentence = text.slice(lastIndex, end).trim()
    if (sentence) sentences.push(sentence)
    lastIndex = match.index + match[0].length
  }

  // Capture any trailing text that didn't end with a sentence boundary
  const remaining = text.slice(lastIndex).trim()
  if (remaining) sentences.push(remaining)

  return sentences
}

// ─── Chunk type classification ──────────────────────────────────────────────

const HOLDING_KEYWORDS = /\b(held|holding|conclusion|therefore|accordingly|we (find|hold|conclude|determine)|it is ordered|decision|judgment)\b/i
const PROCEDURAL_KEYWORDS = /\b(procedure|step|process|follow|must|shall|submit|file|complete|instructions|form\s+\d+)\b/i
const CITATION_TABLE_THRESHOLD = 0.4 // > 40% of lines contain citations

function classifyChunkType(
  content: string,
  sourceType: string,
  sectionTitle: string,
): string {
  const lower = content.toLowerCase()
  const titleLower = sectionTitle.toLowerCase()

  // Check for holding/conclusion patterns
  if (HOLDING_KEYWORDS.test(content) && (
    titleLower.includes('holding') ||
    titleLower.includes('conclusion') ||
    titleLower.includes('decision') ||
    titleLower.includes('order')
  )) {
    return 'holding'
  }

  // Check for citation table (many lines with citations)
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length > 3) {
    const citationLines = lines.filter(l =>
      /(?:§|IRC|I\.R\.C\.|Treas\.\s*Reg\.|IRM|Rev\.\s*(?:Rul|Proc)\.|T\.C\.)/i.test(l)
    )
    if (citationLines.length / lines.length > CITATION_TABLE_THRESHOLD) {
      return 'citation_table'
    }
  }

  // Check for AI-generated summary
  if (titleLower.includes('summary') || titleLower.includes('abstract')) {
    return 'summary'
  }

  // Source-type based classification
  const canonicalTypes = ['irc', 'reg', 'irm', 'treas_reg', 'cfr']
  if (canonicalTypes.some(t => sourceType.toLowerCase().includes(t))) {
    // IRM procedural content
    if (sourceType.toLowerCase().includes('irm') && PROCEDURAL_KEYWORDS.test(content)) {
      return 'procedural'
    }
    return 'canonical_section'
  }

  // PLR / court opinion analysis
  if (sourceType.toLowerCase().includes('plr') ||
      sourceType.toLowerCase().includes('tc') ||
      sourceType.toLowerCase().includes('court')) {
    if (HOLDING_KEYWORDS.test(content)) {
      return 'holding'
    }
    return 'analysis'
  }

  return 'canonical_section'
}

// ─── Content hash ───────────────────────────────────────────────────────────

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

// ─── Overlap prefix builder ─────────────────────────────────────────────────

function buildOverlapPrefix(section: ParsedSection, parentTitle?: string): string {
  const parts: string[] = []
  if (parentTitle) parts.push(parentTitle)
  if (section.citationString) parts.push(section.citationString)
  else if (section.title) parts.push(section.title)

  const prefix = parts.join(' — ')
  // Trim to OVERLAP_PREFIX_TOKENS
  const maxChars = CHUNK_LIMITS.OVERLAP_PREFIX_TOKENS * 4
  if (prefix.length > maxChars) {
    return prefix.slice(0, maxChars).trimEnd() + '...'
  }
  return prefix
}

// ─── Core splitting logic ───────────────────────────────────────────────────

/**
 * Split text into chunks at sentence boundaries, targeting the configured
 * token range. Returns an array of content strings.
 */
function splitAtSentenceBoundaries(
  text: string,
  targetMin: number,
  targetMax: number,
): string[] {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return []

  const chunks: string[] = []
  let currentChunk = ''
  let currentTokens = 0

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence)
    const separator = currentChunk ? ' ' : ''
    const newTokens = currentTokens + countTokens(separator) + sentenceTokens

    if (currentChunk && newTokens > targetMax) {
      // Current chunk is full enough — push it and start new one
      chunks.push(currentChunk)
      currentChunk = sentence
      currentTokens = sentenceTokens
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence
      currentTokens = newTokens
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

// ─── Section walker ─────────────────────────────────────────────────────────

interface WalkContext {
  sourceType: string
  sourceUrl: string
  jurisdiction?: string
  issueTags: string[]
  authorityStatus: AuthorityStatus
  parentTitle?: string
}

function walkSection(
  section: ParsedSection,
  ctx: WalkContext,
  output: ChunkOutput[],
): void {
  const sectionTokens = countTokens(section.content)
  const overlapPrefix = buildOverlapPrefix(section, ctx.parentTitle)
  const prefixForContent = overlapPrefix ? overlapPrefix + '\n\n' : ''

  // If section has children, process children with this section as parent context
  if (section.children.length > 0) {
    // If the section itself has content (preamble before children), chunk it
    if (section.content.trim()) {
      emitChunks(
        section.content,
        section,
        ctx,
        prefixForContent,
        output,
      )
    }

    // Recurse into children
    for (const child of section.children) {
      walkSection(child, {
        ...ctx,
        parentTitle: section.title || ctx.parentTitle,
      }, output)
    }
    return
  }

  // Leaf section — chunk based on size
  if (!section.content.trim()) return

  emitChunks(
    section.content,
    section,
    ctx,
    prefixForContent,
    output,
  )
}

function emitChunks(
  content: string,
  section: ParsedSection,
  ctx: WalkContext,
  prefix: string,
  output: ChunkOutput[],
): void {
  const contentTokens = countTokens(content)

  if (contentTokens <= CHUNK_LIMITS.TARGET_MAX_TOKENS) {
    // Fits in one chunk
    const fullContent = prefix + content
    output.push(makeChunkOutput(fullContent, section, ctx, output.length))
  } else {
    // Need to split at sentence boundaries
    const parts = splitAtSentenceBoundaries(
      content,
      CHUNK_LIMITS.TARGET_MIN_TOKENS,
      CHUNK_LIMITS.TARGET_MAX_TOKENS,
    )

    for (const part of parts) {
      const fullContent = prefix + part
      output.push(makeChunkOutput(fullContent, section, ctx, output.length))
    }
  }
}

function makeChunkOutput(
  content: string,
  section: ParsedSection,
  ctx: WalkContext,
  index: number,
): ChunkOutput {
  return {
    content,
    chunkIndex: index,
    metadata: {
      sourceType: ctx.sourceType,
      authorityTier: section.authorityTier,
      authorityStatus: ctx.authorityStatus,
      precedentialStatus: section.precedentialStatus,
      publicationDate: section.publicationDate ?? null,
      effectiveDate: section.effectiveDate ?? null,
      citationString: section.citationString,
      parentCitation: ctx.parentTitle ?? null,
      jurisdiction: ctx.jurisdiction ?? null,
      issueTags: ctx.issueTags,
      sourceUrl: ctx.sourceUrl,
      contentHash: computeContentHash(content),
      superseded: false,
      chunkType: classifyChunkType(content, ctx.sourceType, section.title),
      tokenCount: countTokens(content),
    },
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function chunkAuthority(
  sections: ParsedSection[],
  options: {
    sourceType: string
    sourceUrl: string
    jurisdiction?: string
    issueTags?: string[]
    authorityStatus?: AuthorityStatus
  },
): ChunkOutput[] {
  const output: ChunkOutput[] = []

  const ctx: WalkContext = {
    sourceType: options.sourceType,
    sourceUrl: options.sourceUrl,
    jurisdiction: options.jurisdiction,
    issueTags: options.issueTags ?? [],
    authorityStatus: options.authorityStatus ?? 'CURRENT',
  }

  for (const section of sections) {
    walkSection(section, ctx, output)
  }

  // Re-index after all chunks are collected
  for (let i = 0; i < output.length; i++) {
    output[i].chunkIndex = i
  }

  return output
}
