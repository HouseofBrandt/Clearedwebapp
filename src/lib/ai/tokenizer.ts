import crypto from "crypto"

const DEV_KEY = "dev-encryption-key-change-in-production-32chars"

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY environment variable is required in production. " +
        "Set a cryptographically random 32+ character string."
      )
    }
    console.warn("[SECURITY] Using development encryption key. Set ENCRYPTION_KEY for production.")
    return DEV_KEY
  }
  if (key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters long.")
  }
  return key
}

interface TokenMapping {
  [token: string]: string
}

interface TokenizerResult {
  tokenizedText: string
  tokenMap: TokenMapping
}

// Generate a short deterministic hash for a given value and type
function generateHash(value: string, type: string): string {
  return crypto
    .createHash("sha256")
    .update(`${type}:${value}`)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase()
}

// Tier 1: Always strip — SSN, EIN, names, DOB, addresses, bank accounts, routing numbers
const TIER1_PATTERNS: { pattern: RegExp; type: string; prefix: string }[] = [
  {
    // SSN: 123-45-6789 (require hyphens to avoid matching 9-digit financial amounts)
    // Also match XXX-XX-XXXX preceded by SSN/TIN/Social label for unhyphenated forms
    pattern: /\b(\d{3}-\d{2}-\d{4})\b/g,
    type: "SSN",
    prefix: "SSN",
  },
  {
    // Unhyphenated SSN only when preceded by a label like "SSN", "TIN", "Social Security"
    pattern: /(?:SSN|TIN|Social\s*Security\s*(?:Number|No\.?|#)?)\s*:?\s*(\d{9})\b/gi,
    type: "SSN",
    prefix: "SSN",
  },
  {
    // EIN: 12-3456789
    pattern: /\b(\d{2}-\d{7})\b/g,
    type: "EIN",
    prefix: "EIN",
  },
  {
    // Bank account numbers (8-17 digits)
    pattern: /\b(?:account\s*(?:number|#|no\.?)?:?\s*)(\d{8,17})\b/gi,
    type: "BANK",
    prefix: "BANK",
  },
  {
    // Routing numbers (9 digits, typically starting with 0-3)
    pattern: /\b(?:routing\s*(?:number|#|no\.?)?:?\s*)(\d{9})\b/gi,
    type: "RTN",
    prefix: "RTN",
  },
  {
    // Date of birth patterns
    pattern: /\b(?:DOB|date\s+of\s+birth|born\s+on|birth\s*date):?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi,
    type: "DOB",
    prefix: "DOB",
  },
]

// Tier 2: Mask with generic labels
const TIER2_PATTERNS: { pattern: RegExp; type: string; prefix: string }[] = [
  {
    // IRS notice numbers (CP, LTR, etc.)
    pattern: /\b((?:CP|LTR|Notice)\s*\d{2,4}[A-Z]?)\b/gi,
    type: "NOTICE",
    prefix: "NOTICE",
  },
]

export function tokenizeText(
  text: string,
  knownNames: string[] = [],
  knownAddresses: string[] = [],
  knownEmployers: string[] = []
): TokenizerResult {
  const tokenMap: TokenMapping = {}
  let tokenized = text

  // Tokenize known names (Tier 1)
  for (const name of knownNames) {
    if (!name || name.length < 2) continue
    const hash = generateHash(name, "NAME")
    const token = `[NAME-${hash}]`
    tokenMap[token] = name
    // Case-insensitive replacement of the full name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    tokenized = tokenized.replace(new RegExp(escaped, "gi"), token)
  }

  // Tokenize known addresses (Tier 1)
  for (const addr of knownAddresses) {
    if (!addr || addr.length < 5) continue
    const hash = generateHash(addr, "ADDR")
    const token = `[ADDR-${hash}]`
    tokenMap[token] = addr
    const escaped = addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    tokenized = tokenized.replace(new RegExp(escaped, "gi"), token)
  }

  // Apply Tier 1 regex patterns
  for (const { pattern, type, prefix } of TIER1_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0
    tokenized = tokenized.replace(pattern, (match, captured) => {
      const value = captured || match
      const hash = generateHash(value, type)
      const token = `[${prefix}-${hash}]`
      tokenMap[token] = value
      return match.replace(value, token)
    })
  }

  // Apply Tier 2 patterns with sequential numbering
  const tier2Counters: Record<string, number> = {}
  for (const { pattern, type, prefix } of TIER2_PATTERNS) {
    pattern.lastIndex = 0
    const seen = new Map<string, string>()
    tokenized = tokenized.replace(pattern, (match, captured) => {
      const value = (captured || match).trim()
      if (seen.has(value)) return seen.get(value)!
      if (!tier2Counters[type]) tier2Counters[type] = 0
      tier2Counters[type]++
      const token = `[${prefix}-${tier2Counters[type]}]`
      tokenMap[token] = value
      seen.set(value, token)
      return token
    })
  }

  // Tokenize street addresses heuristically (number + street name patterns)
  const addressPattern = /\b(\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Way|Ct|Court|Pl|Place|Cir|Circle)\.?(?:\s*,?\s*(?:Apt|Suite|Unit|#)\s*\d+[A-Z]?)?)\b/g
  tokenized = tokenized.replace(addressPattern, (match) => {
    const hash = generateHash(match, "ADDR")
    const token = `[ADDR-${hash}]`
    if (!tokenMap[token]) {
      tokenMap[token] = match
    }
    return token
  })

  // Tokenize known employers (Tier 2 — sequential numbering)
  for (let i = 0; i < knownEmployers.length; i++) {
    const emp = knownEmployers[i]
    if (!emp || emp.length < 3) continue
    const token = `[EMPLOYER-${i + 1}]`
    tokenMap[token] = emp
    const escaped = emp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    tokenized = tokenized.replace(new RegExp(escaped, "gi"), token)
  }

  return { tokenizedText: tokenized, tokenMap }
}

/**
 * Pre-flight validation: scan tokenized text for remaining PII patterns.
 * Returns warnings if potential PII is found — the caller decides whether to block or log.
 */
export function validateTokenization(text: string): {
  passed: boolean
  warnings: string[]
} {
  const warnings: string[] = []

  // Check for remaining SSN patterns (with hyphens)
  const ssnMatches = text.match(/\b\d{3}-\d{2}-\d{4}\b/g)
  if (ssnMatches) {
    warnings.push(`Found ${ssnMatches.length} potential SSN(s) still in text`)
  }

  // Check for remaining EIN patterns (but not inside tokens like [EIN-ABC123])
  const einPattern = /(?<!\[EIN-)\b\d{2}-\d{7}\b/g
  const einMatches = text.match(einPattern)
  if (einMatches) {
    warnings.push(`Found ${einMatches.length} potential EIN(s) still in text`)
  }

  // Check for 9-digit numbers preceded by SSN/TIN context
  const unhyphenated = text.match(/(?:SSN|TIN|Social)\s*:?\s*\d{9}\b/gi)
  if (unhyphenated) {
    warnings.push(`Found ${unhyphenated.length} potential unhyphenated SSN(s)`)
  }

  return {
    passed: warnings.length === 0,
    warnings,
  }
}

export function detokenizeText(
  tokenizedText: string,
  tokenMap: TokenMapping
): string {
  const entries = Object.entries(tokenMap)
  if (entries.length === 0) return tokenizedText

  // Build a single regex that matches any token in one pass — O(n) instead of O(n*m)
  const escaped = entries.map(([token]) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = new RegExp(escaped.join("|"), "g")
  return tokenizedText.replace(pattern, (match) => tokenMap[match] ?? match)
}

export function encryptTokenMap(tokenMap: TokenMapping): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    crypto.createHash("sha256").update(key).digest(),
    iv
  )
  let encrypted = cipher.update(JSON.stringify(tokenMap), "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

export function decryptTokenMap(encrypted: string): TokenMapping {
  const key = getEncryptionKey()
  const [ivHex, encryptedData] = encrypted.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    crypto.createHash("sha256").update(key).digest(),
    iv
  )
  let decrypted = decipher.update(encryptedData, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return JSON.parse(decrypted)
}
