/**
 * Fuzzy AcroForm Field Matcher
 * ----------------------------
 * Given a schema field (id, label, IRS reference) and the actual list of
 * AcroForm fields extracted from a PDF, find the best PDF field name
 * to fill — without requiring a hand-coded map.
 *
 * This is what makes "any IRS form" support possible. The IRS uses a
 * predictable naming convention for AcroForm fields, but it varies wildly
 * across forms and revisions. Examples:
 *
 *   "topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t4[0]"   ← Form 433-A name field
 *   "topmostSubform[0].Page1[0].EmployerName[0]"               ← cleaner, modern style
 *   "f1_1[0]"                                                  ← short numeric style
 *   "Name_of_Taxpayer"                                         ← human-readable style
 *
 * Strategy (in order):
 *   1. Exact match in explicit map (if provided)
 *   2. Score each PDF field against the schema field by:
 *      - IRS line number match (line "1a" → field name contains "1a", "Line1a", "L1a", etc.)
 *      - Token overlap (label words appear in field name)
 *      - Semantic synonyms ("ssn" ↔ "social security", "dob" ↔ "birth", etc.)
 *      - Section context (page number, parent group)
 *   3. Return the highest-scoring match above a confidence threshold
 *
 * If no field scores above the threshold, return null and let the coordinate
 * fallback take over.
 */

export interface PDFFieldInfo {
  name: string
  type: string // "PDFTextField", "PDFCheckBox", "PDFRadioGroup", "PDFDropdown"
  page?: number // detected from name prefix when possible
}

export interface SchemaFieldInfo {
  id: string
  label: string
  type: string
  irsReference?: string // e.g., "Form 433-A, Line 14a"
  sectionTitle?: string
  parentGroup?: string // for repeating group sub-fields, e.g., "bank_accounts"
  rowIndex?: number // for repeating group sub-fields, 0-based
}

export interface MatchResult {
  fieldName: string
  score: number // 0-100
  reasons: string[] // why this matched
}

// Synonyms for semantic matching: schema-side word → PDF-side variants
const SYNONYMS: Record<string, string[]> = {
  ssn: ["socialsecurity", "ssn", "tin", "f02_030", "f02_034"],
  ein: ["employeridentification", "ein", "fein"],
  dob: ["dateofbirth", "birthdate", "dob", "birth"],
  name: ["name", "taxpayer"],
  spouse: ["spouse", "secondary"],
  address: ["address", "street", "addr"],
  city: ["city", "town"],
  state: ["state", "st"],
  zip: ["zip", "zipcode", "postal"],
  county: ["county", "parish"],
  phone: ["phone", "telephone", "tel"],
  email: ["email", "emailaddress"],
  employer: ["employer", "company"],
  bank: ["bank", "financialinstitution", "institution"],
  account: ["account", "acct", "acctno"],
  balance: ["balance", "amount", "value"],
  dependent: ["dependent", "dependant", "child", "claimedasdependents"],
  age: ["age", "yearsold"],
  relationship: ["relationship", "rel"],
  income: ["income", "earnings", "wages", "gross"],
  expense: ["expense", "expenditure", "cost", "monthly"],
  marital: ["marital", "marriage"],
  married: ["married", "marital"],
  vehicle: ["vehicle", "car", "auto"],
  property: ["property", "realestate", "realproperty", "home", "residence"],
  bankruptcy: ["bankruptcy", "bk"],
  lawsuit: ["lawsuit", "litigation", "suit"],
  signature: ["signature", "sign"],
  date: ["date", "dt"],
  yes: ["yes", "y"],
  no: ["no", "n"],
}

// Tokens we strip when computing token overlap (too generic to be discriminating)
const STOP_WORDS = new Set([
  "the", "of", "a", "an", "or", "and", "to", "for", "on", "in", "at",
  "is", "are", "be", "by", "with", "from", "your", "you", "this", "that",
  "form", "line", "section", "field", "type", "value", "amount", "number", "no",
])

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Normalize a string for comparison: lowercase, alphanumeric only. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Tokenize a label into discriminating words (stop words removed). */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

/** Extract candidate IRS line refs from a string: "Line 1a", "L1a", "1a". */
function extractLineRefs(s: string): string[] {
  const out = new Set<string>()
  const matches = s.matchAll(/\b(?:line\s*|l)?(\d{1,3}[a-z]?)\b/gi)
  for (const m of matches) {
    out.add(m[1].toLowerCase())
  }
  return Array.from(out)
}

/** Detect the page number from a field name's prefix. */
function detectPage(fieldName: string): number | undefined {
  const m = /Page(\d+)/i.exec(fieldName)
  return m ? Number(m[1]) : undefined
}

/** Get the "leaf" of an AcroForm path: last path segment, brackets stripped. */
function leaf(fieldName: string): string {
  const parts = fieldName.split(/\.|>/)
  const last = parts[parts.length - 1] || fieldName
  return last.replace(/\[\d+\]/g, "")
}

/** Detect a row index in a PDF field name: "Row1", "Row2", "_0_", "[1]" */
function detectRowIndex(fieldName: string): number | undefined {
  // "Row1" → 0, "Row2" → 1
  const rowMatch = /Row(\d+)/i.exec(fieldName)
  if (rowMatch) return Number(rowMatch[1]) - 1

  // "Bank1", "Account2" → 0, 1
  const numMatch = /(?:bank|account|employer|vehicle|property|investment|dependent)(\d+)/i.exec(fieldName)
  if (numMatch) return Number(numMatch[1]) - 1

  return undefined
}

// ────────────────────────────────────────────────────────────────────────────
// Scoring
// ────────────────────────────────────────────────────────────────────────────

function scoreFieldMatch(schema: SchemaFieldInfo, pdf: PDFFieldInfo): MatchResult {
  const reasons: string[] = []
  let score = 0

  const pdfNorm = norm(pdf.name)
  const pdfLeaf = norm(leaf(pdf.name))
  const idNorm = norm(schema.id)
  const labelNorm = norm(schema.label)

  // 1. EXACT MATCH on schema ID anywhere in PDF field name (rare but powerful)
  if (pdfNorm.includes(idNorm) && idNorm.length >= 4) {
    score += 60
    reasons.push(`schema id "${schema.id}" appears in PDF name`)
  }

  // 2. EXACT MATCH on leaf
  if (pdfLeaf === idNorm) {
    score += 70
    reasons.push("leaf exactly matches schema id")
  }

  // 3. IRS LINE REFERENCE MATCH
  if (schema.irsReference) {
    const wantedLines = extractLineRefs(schema.irsReference)
    const pdfLines = extractLineRefs(pdf.name)
    const intersect = wantedLines.filter((l) => pdfLines.includes(l))
    if (intersect.length > 0) {
      score += 40
      reasons.push(`IRS line ref match: ${intersect.join(", ")}`)
    }
  }

  // 4. ROW INDEX MATCH (for repeating group sub-fields)
  if (schema.rowIndex != null) {
    const pdfRow = detectRowIndex(pdf.name)
    if (pdfRow == null) {
      score -= 20 // schema field is in a row but PDF has no row index — probably wrong
    } else if (pdfRow === schema.rowIndex) {
      score += 30
      reasons.push(`row ${schema.rowIndex + 1} match`)
    } else {
      score -= 50 // wrong row
    }
  }

  // 5. PARENT GROUP HINT
  if (schema.parentGroup) {
    const groupNorm = norm(schema.parentGroup)
    if (pdfNorm.includes(groupNorm)) {
      score += 20
      reasons.push(`parent group "${schema.parentGroup}" present`)
    }
    // Synonym check: "bank_accounts" → "Bank", "Account", "FinancialInstitution"
    const groupTokens = tokens(schema.parentGroup)
    for (const token of groupTokens) {
      const syns = SYNONYMS[token] || [token]
      if (syns.some((s) => pdfNorm.includes(s))) {
        score += 10
        reasons.push(`parent group synonym "${token}"`)
        break
      }
    }
  }

  // 6. TOKEN OVERLAP (label words appearing in field name)
  const labelTokens = tokens(schema.label)
  const idTokens = tokens(schema.id.replace(/_/g, " "))
  const allWanted = new Set([...labelTokens, ...idTokens])
  let tokenHits = 0
  for (const t of allWanted) {
    if (pdfNorm.includes(t)) {
      tokenHits++
      continue
    }
    // Try synonyms
    const syns = SYNONYMS[t]
    if (syns && syns.some((s) => pdfNorm.includes(s))) {
      tokenHits += 0.7 // partial credit for synonym match
    }
  }
  if (allWanted.size > 0) {
    const ratio = tokenHits / allWanted.size
    score += Math.round(ratio * 30)
    if (tokenHits > 0) reasons.push(`${Math.round(tokenHits)} of ${allWanted.size} label tokens matched`)
  }

  // 7. TYPE COMPATIBILITY BONUS / PENALTY
  const wantsCheckbox = schema.type === "yes_no"
  const wantsRadio = schema.type === "single_select"
  const isCheckbox = pdf.type === "PDFCheckBox"
  const isRadio = pdf.type === "PDFRadioGroup"
  const isText = pdf.type === "PDFTextField"
  const isDropdown = pdf.type === "PDFDropdown"

  if (wantsCheckbox && isCheckbox) {
    score += 15
    reasons.push("yes/no ↔ checkbox")
  } else if (wantsRadio && (isRadio || isDropdown)) {
    score += 10
    reasons.push("single_select ↔ radio/dropdown")
  } else if (wantsCheckbox && isText) {
    score -= 30 // probably wrong
  } else if (!wantsCheckbox && !wantsRadio && isCheckbox) {
    score -= 20
  }

  // 8. NEGATIVE: name suggests "spouse" but schema field doesn't (or vice versa)
  const labelHasSpouse = /spouse/i.test(schema.label) || /spouse/i.test(schema.id)
  const pdfHasSpouse = /spouse|secondary/i.test(pdf.name)
  if (labelHasSpouse !== pdfHasSpouse) {
    score -= 25
  }

  return { fieldName: pdf.name, score: Math.max(0, score), reasons }
}

/**
 * Find the best PDF field for a given schema field.
 * Returns null if no candidate scores above the confidence threshold.
 */
export function findBestPdfField(
  schema: SchemaFieldInfo,
  pdfFields: PDFFieldInfo[],
  opts: { minScore?: number; excludeNames?: Set<string> } = {}
): MatchResult | null {
  const minScore = opts.minScore ?? 50
  const exclude = opts.excludeNames || new Set()

  let best: MatchResult | null = null
  for (const pdf of pdfFields) {
    if (exclude.has(pdf.name)) continue
    const result = scoreFieldMatch(schema, pdf)
    if (!best || result.score > best.score) best = result
  }

  if (!best || best.score < minScore) return null
  return best
}

/**
 * Build a complete fuzzy mapping for a schema's fields against a PDF.
 * Greedy assignment: high-confidence matches lock first; lower-confidence
 * matches can't reuse already-assigned fields.
 *
 * Returns:
 *   - mappings: schema field id → PDF field name
 *   - unmapped: schema field ids with no match
 *   - lowConfidence: schema field ids matched but score < 75 (worth review)
 */
export function buildFuzzyMap(
  schemaFields: SchemaFieldInfo[],
  pdfFields: PDFFieldInfo[],
  opts: { minScore?: number; reviewThreshold?: number } = {}
): {
  mappings: Record<string, string>
  unmapped: string[]
  lowConfidence: string[]
} {
  const minScore = opts.minScore ?? 50
  const reviewThreshold = opts.reviewThreshold ?? 75

  // Score every (schema, pdf) pair
  const candidates: { schemaId: string; result: MatchResult }[] = []
  for (const schema of schemaFields) {
    for (const pdf of pdfFields) {
      const result = scoreFieldMatch(schema, pdf)
      if (result.score >= minScore) {
        candidates.push({ schemaId: schema.id, result })
      }
    }
  }

  // Greedy assignment: highest scores first, no field reused
  candidates.sort((a, b) => b.result.score - a.result.score)
  const mappings: Record<string, string> = {}
  const lowConfidence: string[] = []
  const usedPdfFields = new Set<string>()
  const matchedSchemaIds = new Set<string>()

  for (const c of candidates) {
    if (matchedSchemaIds.has(c.schemaId)) continue
    if (usedPdfFields.has(c.result.fieldName)) continue
    mappings[c.schemaId] = c.result.fieldName
    matchedSchemaIds.add(c.schemaId)
    usedPdfFields.add(c.result.fieldName)
    if (c.result.score < reviewThreshold) {
      lowConfidence.push(c.schemaId)
    }
  }

  const unmapped = schemaFields
    .filter((f) => !matchedSchemaIds.has(f.id))
    .map((f) => f.id)

  return { mappings, unmapped, lowConfidence }
}
