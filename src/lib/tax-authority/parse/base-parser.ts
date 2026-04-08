/**
 * Base Parser — abstract base class for all tax authority document parsers.
 */

import type { AuthorityTier, PrecedentialStatus } from '../types'

export interface ParsedSection {
  title: string
  citationString: string
  normalizedCitation: string
  content: string
  children: ParsedSection[]
  metadata: Record<string, unknown>
  authorityTier: AuthorityTier
  precedentialStatus: PrecedentialStatus
  effectiveDate?: Date
  publicationDate?: Date
}

export interface ParseResult {
  sections: ParsedSection[]
  citations: string[]  // All extracted citation strings
  title: string
  sourceType: string
}

export abstract class BaseParser {
  abstract parse(rawContent: string, metadata?: Record<string, unknown>): Promise<ParseResult>
}
