// Authority & source types matching Prisma enums
export type AuthorityTier = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'B1' | 'B2' | 'C1' | 'C2' | 'D1' | 'X'
export type AuthorityStatus = 'CURRENT' | 'PROPOSED' | 'WITHDRAWN' | 'SUPERSEDED' | 'ARCHIVED' | 'PENDING_REVIEW'
export type PrecedentialStatus = 'BINDING' | 'AUTHORITATIVE' | 'PRECEDENTIAL' | 'NONPRECEDENTIAL' | 'INFORMATIONAL' | 'INTERNAL'
export type SourceRightsProfile = 'PUBLIC_INGEST_OK' | 'PUBLIC_LINK_ONLY' | 'LICENSE_REQUIRED' | 'NO_AUTOMATION' | 'HUMAN_SUMMARY_ONLY'
export type ChangeSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'INFORMATIONAL_CHANGE'
export type IngestionStatus = 'PENDING' | 'FETCHING' | 'PARSING' | 'CHUNKING' | 'EMBEDDING' | 'COMPLETE' | 'FAILED' | 'SKIPPED'
export type PromotionLayer = 'RAW' | 'CURATED' | 'DISTILLED'

export type IssueCategory =
  | 'collection' | 'oic' | 'penalty_abatement' | 'filing_compliance'
  | 'procedure' | 'appeals' | 'innocent_spouse' | 'payroll'
  | 'litigation' | 'installment' | 'mixed'

export interface ChunkMetadata {
  sourceType: string
  authorityTier: AuthorityTier
  authorityStatus: AuthorityStatus
  precedentialStatus: PrecedentialStatus
  publicationDate: Date | null
  effectiveDate: Date | null
  citationString: string
  parentCitation: string | null
  jurisdiction: string | null
  issueTags: string[]
  sourceUrl: string
  contentHash: string
  superseded: boolean
  chunkType: string
  tokenCount: number
}

export interface RankedChunk {
  chunkId: string
  content: string
  metadata: ChunkMetadata
  baseWeight: number
  effectiveWeight: number
  matchType: 'vector' | 'fulltext' | 'hybrid'
  similarityScore: number
}

export interface EvidencePack {
  issueClassification: IssueCategory[]
  controllingAuthority: RankedChunk[]
  officialGuidance: RankedChunk[]
  relevantPrecedent: RankedChunk[]
  proceduralGuidance: RankedChunk[]
  reasoningSupport: RankedChunk[]
  internalExamples: RankedChunk[]
  cautionFlags: CautionFlag[]
  metadata: {
    totalChunks: number
    topTier: AuthorityTier
    freshestSource: Date
    benchmarkConfidence: number
  }
}

export interface CautionFlag {
  type: 'superseded' | 'conflicting' | 'recent_change' | 'stale' | 'nonprecedential'
  message: string
  citationString?: string
  severity: 'warning' | 'info'
}

export interface HarvestResult {
  sourceId: string
  itemsFetched: number
  itemsNew: number
  itemsChanged: number
  itemsSkipped: number
  itemsFailed: number
  errors: string[]
  durationMs: number
}

export interface SupersessionReport {
  superseded: number
  newVersions: number
  withdrawn: number
  staleItems: number
  details: Array<{
    citationString: string
    action: 'superseded' | 'withdrawn' | 'stale'
    replacedBy?: string
  }>
}

export interface BenchmarkScore {
  citationPrecision: number
  citationRecall: number
  topTierMatch: boolean
  conceptCoverage: number
  noContamination: boolean
  driftDetected: boolean
  overallScore: number
}

export interface GapReport {
  corrections: number
  missingCitations: number
  staleCitations: number
  benchmarkDrifts: number
  gaps: Array<{
    type: 'correction' | 'missing_citation' | 'stale_citation' | 'benchmark_drift'
    description: string
    issueArea?: string
  }>
}

export interface SourceConfig {
  sourceId: string
  name: string
  endpoint: string
  altEndpoint?: string
  format: string
  cadence: string
  rightsProfile: SourceRightsProfile
  defaultTier: AuthorityTier
  parserKey: string
  rateLimitMs: number
}
