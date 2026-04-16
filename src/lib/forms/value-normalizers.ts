/**
 * Value Normalizers
 * -----------------
 * Bulletproof input cleaning for form values. Every value that lands in a
 * form field — whether from AI extraction, OCR, prior forms, or user input —
 * passes through these normalizers so the downstream fillers/validators see
 * a single canonical representation.
 *
 * Why this exists: data comes in messy. A bank statement says "$1,500.00"
 * but the IRS PDF expects "1500.00" or "1,500". A pay stub says "12/15/24"
 * but the PDF expects "MM/DD/YYYY". Without a single normalization layer,
 * every consumer reinvents this and makes the same bugs.
 */

import type { FieldType } from "./types"

// ────────────────────────────────────────────────────────────────────────────
// CURRENCY
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse any currency-like value into a finite number, or null if invalid.
 * Accepts: "$1,500.00", "1500", 1500, "(500)", "-500", "500.00 USD", null, "".
 * Returns: 1500.00, null, etc.
 */
export function parseCurrency(input: unknown): number | null {
  if (input == null || input === "") return null
  if (typeof input === "number") return Number.isFinite(input) ? input : null

  let s = String(input).trim()
  if (!s) return null

  // Accounting parens for negatives: "(500)" → -500
  let negative = false
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true
    s = s.slice(1, -1)
  }

  // Strip currency symbols, codes, commas, whitespace
  s = s.replace(/[$£€¥₹]/g, "")
  s = s.replace(/\b(USD|EUR|GBP|CAD|AUD)\b/gi, "")
  s = s.replace(/,/g, "").trim()

  // Handle "1500-" trailing minus (some statements)
  if (s.endsWith("-")) {
    negative = true
    s = s.slice(0, -1)
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

/**
 * Format a number for display in a PDF currency field.
 * IRS forms want plain numbers without $ signs (the form prints the $ for you):
 * 1500 → "1,500" (no decimals if whole), or "1,500.50" (decimals if fractional)
 */
export function formatCurrencyForPdf(value: unknown, opts: { showCents?: boolean } = {}): string {
  const n = parseCurrency(value)
  if (n == null) return ""
  const showCents = opts.showCents ?? !Number.isInteger(n)
  return n.toLocaleString("en-US", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// DATES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a date from a wide range of formats. Returns Date or null.
 * Accepts: "01/15/2024", "1/15/24", "Jan 15, 2024", "January 15, 2024",
 *          "2024-01-15", "15-Jan-2024", Date object.
 */
export function parseDate(input: unknown): Date | null {
  if (!input) return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input

  const s = String(input).trim()
  if (!s) return null

  // ISO: 2024-01-15 or 2024-01-15T...
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // US: MM/DD/YYYY or M/D/YY
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(s)
  if (us) {
    let year = Number(us[3])
    if (year < 100) year += year < 50 ? 2000 : 1900 // "24" → 2024, "98" → 1998
    const d = new Date(year, Number(us[1]) - 1, Number(us[2]))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // DD-MMM-YYYY: 15-Jan-2024
  const dmy = /^(\d{1,2})[\-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\-\s,](\d{2,4})$/i.exec(s)
  if (dmy) {
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
    let year = Number(dmy[3])
    if (year < 100) year += year < 50 ? 2000 : 1900
    const d = new Date(year, months[dmy[2].slice(0, 3).toLowerCase()], Number(dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // Last resort: native Date parser (handles "January 15, 2024", etc.)
  const native = new Date(s)
  if (!Number.isNaN(native.getTime())) {
    // Reject dates before 1900 or > 100 years in the future as garbage parses
    const year = native.getFullYear()
    if (year >= 1900 && year < new Date().getFullYear() + 100) return native
  }
  return null
}

/** Format a date for the IRS PDF: MM/DD/YYYY */
export function formatDateForPdf(input: unknown): string {
  const d = parseDate(input)
  if (!d) return ""
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

/** Format a date for HTML <input type="date">: YYYY-MM-DD */
export function formatDateForInput(input: unknown): string {
  const d = parseDate(input)
  if (!d) return ""
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

// ────────────────────────────────────────────────────────────────────────────
// PHONE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Strip a phone number to digits only, preserving leading 1 for US.
 * "+1 (555) 123-4567" → "5551234567"
 * "555.123.4567" → "5551234567"
 */
export function parsePhoneDigits(input: unknown): string {
  if (input == null) return ""
  const digits = String(input).replace(/\D/g, "")
  // Strip US country code if present
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1)
  return digits
}

/** Format a US phone for display: "(555) 123-4567" */
export function formatPhone(input: unknown): string {
  const d = parsePhoneDigits(input)
  if (d.length !== 10) return String(input ?? "")
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Format a US phone for IRS PDFs: "555-123-4567" (no parens, IRS style) */
export function formatPhoneForPdf(input: unknown): string {
  const d = parsePhoneDigits(input)
  if (d.length !== 10) return String(input ?? "")
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

// ────────────────────────────────────────────────────────────────────────────
// SSN / ITIN / EIN
// ────────────────────────────────────────────────────────────────────────────

/** Strip SSN to 9 digits. Returns "" if not a plausible SSN. */
export function parseSsnDigits(input: unknown): string {
  if (input == null) return ""
  const digits = String(input).replace(/\D/g, "")
  return digits.length === 9 ? digits : ""
}

/** Format SSN as XXX-XX-XXXX. */
export function formatSsn(input: unknown): string {
  const d = parseSsnDigits(input)
  if (!d) return String(input ?? "")
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** Format SSN for display with first 5 redacted: ***-**-1234 */
export function formatSsnRedacted(input: unknown): string {
  const d = parseSsnDigits(input)
  if (!d) return ""
  return `***-**-${d.slice(5)}`
}

/** Strip EIN to 9 digits. Returns "" if not plausible. */
export function parseEinDigits(input: unknown): string {
  if (input == null) return ""
  const digits = String(input).replace(/\D/g, "")
  return digits.length === 9 ? digits : ""
}

/** Format EIN as XX-XXXXXXX. */
export function formatEin(input: unknown): string {
  const d = parseEinDigits(input)
  if (!d) return String(input ?? "")
  return `${d.slice(0, 2)}-${d.slice(2)}`
}

// ────────────────────────────────────────────────────────────────────────────
// ZIP
// ────────────────────────────────────────────────────────────────────────────

/** Format ZIP: 5 or 9 digits → "12345" or "12345-6789". */
export function formatZip(input: unknown): string {
  if (input == null) return ""
  const digits = String(input).replace(/\D/g, "")
  if (digits.length === 5) return digits
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return String(input)
}

// ────────────────────────────────────────────────────────────────────────────
// BOOLEAN / YES_NO
// ────────────────────────────────────────────────────────────────────────────

/** Parse loose truthy strings into a boolean. */
export function parseYesNo(input: unknown): boolean | null {
  if (typeof input === "boolean") return input
  if (input == null || input === "") return null
  const s = String(input).trim().toLowerCase()
  if (["yes", "y", "true", "1", "x", "checked", "on"].includes(s)) return true
  if (["no", "n", "false", "0", "unchecked", "off"].includes(s)) return false
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY: Normalize a value based on its declared field type.
// Returns the value in a form ready for the PDF filler / form storage.
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizeOptions {
  /** Output format: "pdf" returns strings ready for PDF; "storage" returns canonical JSON-friendly values. */
  target?: "pdf" | "storage"
}

/**
 * Normalize a value based on its declared field type.
 * Idempotent: re-normalizing already-clean values is safe.
 * Returns: the normalized value; null/empty string if unparseable.
 */
export function normalizeValue(
  value: unknown,
  fieldType: FieldType,
  opts: NormalizeOptions = {}
): any {
  if (value == null || value === "") return null
  const target = opts.target ?? "storage"

  switch (fieldType) {
    case "currency": {
      const n = parseCurrency(value)
      if (n == null) return null
      return target === "pdf" ? formatCurrencyForPdf(n) : n
    }

    case "date": {
      const d = parseDate(value)
      if (!d) return null
      return target === "pdf" ? formatDateForPdf(d) : formatDateForInput(d)
    }

    case "phone": {
      return target === "pdf" ? formatPhoneForPdf(value) : formatPhone(value)
    }

    case "ssn": {
      const formatted = formatSsn(value)
      return formatted || null
    }

    case "ein": {
      const formatted = formatEin(value)
      return formatted || null
    }

    case "yes_no": {
      const b = parseYesNo(value)
      if (b == null) return null
      return target === "pdf" ? (b ? "Yes" : "No") : b
    }

    case "percentage": {
      const n = parseCurrency(value) // same parsing rules apply
      if (n == null) return null
      // Strip "%" if present, return as a number
      return n
    }

    case "text":
    case "textarea":
    case "single_select":
    case "multi_select": {
      return String(value).trim() || null
    }

    case "computed":
    case "repeating_group":
    case "file_upload":
    default:
      return value
  }
}

/**
 * Normalize an entire flat values object based on a schema.
 * Walks the schema once, normalizes each known field by its declared type,
 * leaves unknown keys untouched.
 */
export function normalizeFormValues(
  values: Record<string, any>,
  fieldTypes: Record<string, FieldType>,
  opts: NormalizeOptions = {}
): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, val] of Object.entries(values)) {
    // Detect repeating-group sub-keys: "bank_accounts.0.bank_balance"
    const subMatch = /^(.+?)\.\d+\.(.+)$/.exec(key)
    if (subMatch) {
      const subFieldType = fieldTypes[`${subMatch[1]}.${subMatch[2]}`] || fieldTypes[subMatch[2]]
      if (subFieldType) {
        out[key] = normalizeValue(val, subFieldType, opts)
        continue
      }
    }
    const ft = fieldTypes[key]
    if (ft) {
      out[key] = normalizeValue(val, ft, opts)
    } else {
      out[key] = val
    }
  }
  return out
}
