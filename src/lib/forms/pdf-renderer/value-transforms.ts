import type { ValueTransform } from "../types"

// Pre-fill transforms. Convert stored form values into the string
// representation the PDF expects.
//
// These are applied per-field, based on FieldBinding.transform. If no
// transform is specified, the value is coerced to string with String(value).
//
// Kept simple and pure — no IO, no side effects. Tests live in
// value-transforms.test.ts.

type TransformFn = (value: any) => string

const TRANSFORMS: Record<ValueTransform, TransformFn> = {
  "ssn-format": (v) => {
    const digits = String(v ?? "").replace(/\D/g, "")
    if (digits.length !== 9) return String(v ?? "")
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  },

  "ssn-digits": (v) => {
    // 9 digits, no separators. Used when the AcroForm field has maxLength=9
    // (older forms like 14039 enforce this, the dashed format won't fit).
    const digits = String(v ?? "").replace(/\D/g, "")
    return digits.slice(0, 9)
  },

  "ein-format": (v) => {
    const digits = String(v ?? "").replace(/\D/g, "")
    if (digits.length !== 9) return String(v ?? "")
    return `${digits.slice(0, 2)}-${digits.slice(2)}`
  },

  "ein-digits": (v) => {
    const digits = String(v ?? "").replace(/\D/g, "")
    return digits.slice(0, 9)
  },

  "phone-format": (v) => {
    const digits = String(v ?? "").replace(/\D/g, "")
    // 10-digit US; 11-digit with leading 1
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    return String(v ?? "")
  },

  "phone-digits": (v) => {
    // 10 digits, no formatting. Used when the AcroForm field has
    // maxLength=10 and won't accept the parens / dash form.
    const digits = String(v ?? "").replace(/\D/g, "")
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 11)
    return digits.slice(0, 10)
  },

  "currency-no-symbol": (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v ?? "")
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },

  "currency-whole-dollars": (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v ?? "")
    return Math.round(n).toLocaleString("en-US")
  },

  "date-mmddyyyy": (v) => {
    if (!v) return ""
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return String(v)
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    const yyyy = d.getUTCFullYear()
    return `${mm}/${dd}/${yyyy}`
  },

  "date-mm-dd-yyyy": (v) => {
    if (!v) return ""
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return String(v)
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    const yyyy = d.getUTCFullYear()
    return `${mm}-${dd}-${yyyy}`
  },

  "uppercase": (v) => String(v ?? "").toUpperCase(),
  "lowercase": (v) => String(v ?? "").toLowerCase(),

  "checkbox-x": (v) => {
    if (v === true || v === "true" || v === "yes" || v === 1) return "X"
    return ""
  },

  "yes-no": (v) => {
    if (v === true || v === "true" || v === "yes" || v === 1) return "Yes"
    if (v === false || v === "false" || v === "no" || v === 0) return "No"
    return String(v ?? "")
  },

  "zip-first-5": (v) => {
    // For PDFs that split ZIP into a 5-digit field and a 4-digit field.
    // Accepts "12345", "12345-6789", or "123456789".
    const digits = String(v ?? "").replace(/\D/g, "")
    return digits.slice(0, 5)
  },

  "zip-last-4": (v) => {
    const digits = String(v ?? "").replace(/\D/g, "")
    return digits.length >= 9 ? digits.slice(5, 9) : ""
  },
}

/**
 * Apply a transform (or the default String coercion) to a value.
 * Returns the empty string for null/undefined.
 */
export function applyTransform(value: any, transform?: ValueTransform): string {
  if (value === null || value === undefined) return ""
  if (!transform) return String(value)
  const fn = TRANSFORMS[transform]
  if (!fn) {
    console.warn("[pdf-renderer] unknown transform", { transform })
    return String(value)
  }
  return fn(value)
}

export const __TRANSFORMS_FOR_TESTING = TRANSFORMS
