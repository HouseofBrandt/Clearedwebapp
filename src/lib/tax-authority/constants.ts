import type { AuthorityTier, IssueCategory, SourceConfig } from './types'

// Authority tier base weights
export const AUTHORITY_WEIGHTS: Record<AuthorityTier, number> = {
  A1: 1.00,
  A2: 0.97,
  A3: 0.93,
  A4: 0.90,
  A5: 0.91, // average of sub-tiers
  B1: 0.72,
  B2: 0.65,
  C1: 0.50,
  C2: 0.70,
  D1: 0.38,
  X: -0.50,
}

// Tax Court sub-tier weights
export const TAX_COURT_WEIGHTS = {
  REVIEWED_FULL_COURT: 0.96,
  REGULAR: 0.93,
  MEMORANDUM: 0.88,
  SUMMARY: 0.85,
} as const

// Weight modifiers
export const WEIGHT_MODIFIERS = {
  RECENCY_30_DAYS: 0.10,
  RECENCY_90_DAYS: 0.05,
  JURISDICTION_MATCH: 0.08,
  EXACT_CITATION_HIT: 0.15,
  BENCHMARK_SUCCESS: 0.03,
  SUPERSEDED_PENALTY: -0.50,
  STALE_PENALTY: -0.10,
  PLR_CEILING: 0.60,
  WEIGHT_FLOOR: 0.0,
  WEIGHT_CEILING: 1.15,
} as const

// Source policy per issue category
export const SOURCE_POLICY: Record<IssueCategory, AuthorityTier[]> = {
  oic: ['A1', 'A2', 'B1', 'A4', 'A5', 'C2', 'C1'],
  penalty_abatement: ['A1', 'A2', 'A4', 'B1', 'A5', 'C2', 'C1'],
  collection: ['A1', 'A2', 'B1', 'A4', 'A5', 'C2'],
  filing_compliance: ['A1', 'A2', 'B2', 'B1', 'A4'],
  procedure: ['B1', 'A1', 'A2', 'A4', 'A5'],
  appeals: ['B1', 'A1', 'A5', 'A4', 'A2'],
  innocent_spouse: ['A1', 'A2', 'A5', 'A4', 'B1', 'C1'],
  payroll: ['A1', 'A2', 'A5', 'A4', 'B1'],
  litigation: ['A1', 'A2', 'A5', 'A4', 'C1'],
  installment: ['A1', 'A2', 'B1', 'A4', 'C2'],
  mixed: ['A1', 'A2', 'A4', 'A5', 'B1', 'B2', 'C1', 'C2'],
}

// Source registry configurations
export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    sourceId: 'irc_title26',
    name: 'Internal Revenue Code',
    endpoint: 'https://uscode.house.gov/download/download.shtml',
    altEndpoint: 'https://www.govinfo.gov/bulkdata/USCODE/2024/title26',
    format: 'XML',
    cadence: '0 9 * * 0', // Sunday 4AM CT
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'A1',
    parserKey: 'irc-parser',
    rateLimitMs: 1000,
  },
  {
    sourceId: 'treas_reg_cfr26',
    name: 'Treasury Regulations (26 CFR)',
    endpoint: 'https://www.federalregister.gov/api/v1/documents.json',
    altEndpoint: 'https://www.govinfo.gov/bulkdata/CFR/2025/title-26',
    format: 'JSON',
    cadence: '0 9 * * 1-6', // Daily Mon-Sat 4AM CT
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'A2',
    parserKey: 'reg-parser',
    rateLimitMs: 1000,
  },
  {
    sourceId: 'irs_irm',
    name: 'Internal Revenue Manual',
    endpoint: 'https://www.irs.gov/irm',
    format: 'HTML',
    cadence: '0 9 * * 1-6',
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'B1',
    parserKey: 'irm-parser',
    rateLimitMs: 1000,
  },
  {
    sourceId: 'irs_irb',
    name: 'Internal Revenue Bulletin',
    endpoint: 'https://www.irs.gov/irbs',
    format: 'HTML',
    cadence: '0 8 * * 1', // Monday 3:30AM CT
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'A4',
    parserKey: 'irb-parser',
    rateLimitMs: 1000,
  },
  {
    sourceId: 'ustc_opinions',
    name: 'U.S. Tax Court Opinions',
    endpoint: 'https://www.ustaxcourt.gov/public-case-information/opinions',
    format: 'PDF',
    cadence: '0 9 * * 1-6',
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'A5',
    parserKey: 'tax-court-parser',
    rateLimitMs: 2000,
  },
  {
    sourceId: 'irs_written_determinations',
    name: 'Written Determinations (PLRs, CCAs, TAMs)',
    endpoint: 'https://www.irs.gov/written-determinations',
    format: 'HTML',
    cadence: '0 10 * * 5', // Friday 5:15AM CT
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'C1',
    parserKey: 'plr-parser',
    rateLimitMs: 1000,
  },
  {
    sourceId: 'irs_forms_pubs',
    name: 'IRS Forms, Instructions & Publications',
    endpoint: 'https://www.irs.gov/forms-instructions',
    format: 'PDF',
    cadence: '0 9 * * 6', // Saturday 4AM CT
    rightsProfile: 'PUBLIC_INGEST_OK',
    defaultTier: 'B2',
    parserKey: 'forms-parser',
    rateLimitMs: 1000,
  },
]

// Curated forms for ingestion (tax resolution relevant only)
export const CURATED_FORMS = [
  '433-A', '433-B', '433-F', '433-D', '433-H',
  '656', '656-L', '656-PPV',
  '843', '911', '12153', '12257', '9423', '1127',
  '2848', '8821', '4506-T',
  '14135', '14134', '8857', '12509',
  '9465', '2159',
  '668-D', '668-W', '668-A',
  '8379', '1040',
]

// Curated publications for ingestion
export const CURATED_PUBLICATIONS = [
  '1', '594', '556', '783', '1660', '4235', '5',
]

// Prohibited source domains
export const PROHIBITED_DOMAINS = [
  'taxnotes.com',
  'bloombergtax.com',
  'taxanalysts.org',
  'bna.com',
  'checkpoint.riag.com',
  'westlaw.com',
  'lexisnexis.com',
  'cch.com',
]

// Chunk size limits
export const CHUNK_LIMITS = {
  TARGET_MIN_TOKENS: 600,
  TARGET_MAX_TOKENS: 1200,
  ABSOLUTE_MAX_TOKENS: 1500,
  OVERLAP_PREFIX_TOKENS: 50,
  SUMMARY_MAX_TOKENS: 600,
  HOLDING_MAX_TOKENS: 800,
} as const

// IRM sections to harvest (targeted, not full manual)
export const IRM_TARGET_SECTIONS = [
  '5.8',    // OIC
  '5.15',   // Financial Analysis
  '5.16',   // CNC
  '5.1.9',  // CDP
  '5.1.19', // CSED
  '5.7.3',  // TFRP
  '5.14',   // Installment Agreements
  '20.1.1', // Penalties
  '25.15',  // Innocent Spouse
  '5.11',   // Levies
  '5.12',   // Liens
  '8.22',   // Appeals
  '8.23',   // Appeals Settlement
]
