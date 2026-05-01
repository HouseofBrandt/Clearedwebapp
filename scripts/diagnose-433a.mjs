#!/usr/bin/env node
/**
 * diagnose-433a.mjs — fills the 433-A PDF binding with synthetic values for
 * every declared field ID and dumps the exact failure reason per field.
 *
 * The runtime toast revealed "108 failed at fill" — the V2 renderer counts
 * failures but the wizard UI doesn't dump the per-field reason. This script
 * surfaces them so we can fix the binding (or the PDF mapping) targetedly.
 *
 *   node scripts/diagnose-433a.mjs            # full report, exits non-zero on failure
 *   node scripts/diagnose-433a.mjs --quiet    # only summary line
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { PDFDocument } from "pdf-lib"

const args = process.argv.slice(2)
const QUIET = args.includes("--quiet")

const PDF_PATH     = resolve(process.cwd(), "public/forms/f433a.pdf")
const BINDING_PATH = resolve(process.cwd(), "src/lib/forms/pdf-bindings/433-A/2022-07.json")

const pdfBytes = await readFile(PDF_PATH)
const pdfDoc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
const form     = pdfDoc.getForm()
const actual   = new Map(form.getFields().map((f) => [f.getName(), f]))
const binding  = JSON.parse(await readFile(BINDING_PATH, "utf-8"))

// Generate a plausible value for every field id in the binding so we exercise
// the full bind list. Repeating-group fields use the trailing "_name", "_amount"
// etc. token to pick a value class.
function syntheticValue(fieldId, transform) {
  const lower = fieldId.toLowerCase()
  if (transform === "ssn-format" || transform === "ssn-digits" || lower.endsWith("ssn")) return "123456789"
  if (transform === "ein-format" || transform === "ein-digits" || lower.endsWith("ein")) return "123456789"
  if (transform === "phone-format" || transform === "phone-digits" || lower.includes("phone")) return "5555551234"
  if (transform === "currency-no-symbol" || transform === "currency-whole-dollars") return 1234.56
  if (transform === "date-mmddyyyy" || transform === "date-mm-dd-yyyy" || lower.includes("date") || lower.endsWith("dob")) return "2020-03-15"
  if (transform === "zip-first-5") return "90210"
  if (transform === "zip-last-4") return "1234"
  if (transform === "checkbox-x" || lower.includes("cb_") || lower.includes("checkbox")) return true
  if (lower.includes("amount") || lower.includes("balance") || lower.includes("payment") || lower.includes("income")
      || lower.includes("expense") || lower.includes("equity") || lower.includes("loan") || lower.includes("fmv")
      || lower.includes("value")) return 1234.56
  if (lower.includes("year")) return "2024"
  if (lower.includes("age")) return "42"
  if (lower.includes("percentage")) return "50"
  return "Synthetic"
}

function applyTransform(value, transform) {
  if (value === null || value === undefined) return ""
  const s = String(value)
  switch (transform) {
    case "ssn-format": return s.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4}).*/, "$1-$2-$3")
    case "ssn-digits": return s.replace(/\D/g, "").slice(0, 9)
    case "ein-format": return s.replace(/\D/g, "").replace(/^(\d{2})(\d{7}).*/, "$1-$2")
    case "ein-digits": return s.replace(/\D/g, "").slice(0, 9)
    case "phone-format": {
      const d = s.replace(/\D/g, "")
      return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : s
    }
    case "phone-digits": return s.replace(/\D/g, "").slice(0, 10)
    case "currency-no-symbol":
      return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case "currency-whole-dollars":
      return Math.round(Number(value)).toLocaleString("en-US")
    case "date-mmddyyyy": {
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`
    }
    case "zip-first-5": return s.replace(/\D/g, "").slice(0, 5)
    case "zip-last-4": { const d = s.replace(/\D/g, ""); return d.length >= 9 ? d.slice(5, 9) : "" }
    default: return s
  }
}

const buckets = {
  filled: [],
  missingInPdf: [],   // field path doesn't exist in the PDF
  wrongType: [],      // exists but wrong widget kind
  maxLength: [],      // value too long for the field
  other: [],
}

for (const [fieldId, fb] of Object.entries(binding.fields)) {
  if (!fb.acro) continue
  const name = fb.acro.acroFieldName
  const acroType = fb.acro.acroFieldType || "text"
  const value = syntheticValue(fieldId, fb.transform)
  const display = applyTransform(value, fb.transform)

  if (!actual.has(name)) {
    buckets.missingInPdf.push({ fieldId, name })
    continue
  }
  try {
    if (acroType === "checkbox") {
      const cb = form.getCheckBox(name)
      if (value === true || value === "true" || value === "yes" || value === 1) cb.check(); else cb.uncheck()
    } else {
      const tf = form.getTextField(name)
      tf.setText(String(display))
    }
    buckets.filled.push(fieldId)
  } catch (e) {
    const msg = (e.message || "").slice(0, 200)
    if (msg.includes("not a TextField") || msg.includes("not a CheckBox") || msg.includes("not a RadioGroup") || msg.includes("not a Dropdown")) {
      buckets.wrongType.push({ fieldId, name, msg })
    } else if (msg.includes("maxLength")) {
      buckets.maxLength.push({ fieldId, name, value: display, msg })
    } else {
      buckets.other.push({ fieldId, name, msg })
    }
  }
}

const total =
  buckets.filled.length + buckets.missingInPdf.length + buckets.wrongType.length +
  buckets.maxLength.length + buckets.other.length

console.log("─".repeat(78))
console.log(`433-A binding diagnosis  —  ${total} bound fields`)
console.log(`  filled OK         : ${buckets.filled.length}`)
console.log(`  missing in PDF    : ${buckets.missingInPdf.length}`)
console.log(`  wrong widget type : ${buckets.wrongType.length}`)
console.log(`  exceeds maxLength : ${buckets.maxLength.length}`)
console.log(`  other failures    : ${buckets.other.length}`)
console.log("─".repeat(78))

if (!QUIET) {
  if (buckets.missingInPdf.length) {
    console.log("\n## MISSING IN PDF — binding references a field name that doesn't exist")
    for (const f of buckets.missingInPdf.slice(0, 50)) console.log(`  ${f.fieldId}\n    ${f.name}`)
    if (buckets.missingInPdf.length > 50) console.log(`  …and ${buckets.missingInPdf.length - 50} more`)
  }
  if (buckets.wrongType.length) {
    console.log("\n## WRONG WIDGET TYPE — binding declares text but PDF has checkbox (or vice versa)")
    for (const f of buckets.wrongType.slice(0, 50)) console.log(`  ${f.fieldId}\n    ${f.msg}`)
    if (buckets.wrongType.length > 50) console.log(`  …and ${buckets.wrongType.length - 50} more`)
  }
  if (buckets.maxLength.length) {
    console.log("\n## EXCEEDS MAXLENGTH — value too long for the AcroForm field. Use the digit-only / no-format transform")
    for (const f of buckets.maxLength.slice(0, 50)) console.log(`  ${f.fieldId}  value="${f.value}"\n    ${f.msg}`)
    if (buckets.maxLength.length > 50) console.log(`  …and ${buckets.maxLength.length - 50} more`)
  }
  if (buckets.other.length) {
    console.log("\n## OTHER FAILURES")
    for (const f of buckets.other.slice(0, 50)) console.log(`  ${f.fieldId}\n    ${f.msg}`)
    if (buckets.other.length > 50) console.log(`  …and ${buckets.other.length - 50} more`)
  }
}

const failures =
  buckets.missingInPdf.length + buckets.wrongType.length + buckets.maxLength.length + buckets.other.length
process.exit(failures > 0 ? 1 : 0)
