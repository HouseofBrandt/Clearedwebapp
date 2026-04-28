#!/usr/bin/env node
/**
 * smoke-test-2848.mjs — verifies every binding entry resolves to a real
 * AcroForm field on f2848.pdf, then fills a synthetic instance to /tmp.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { PDFDocument } from "pdf-lib"

const PDF_PATH = resolve(process.cwd(), "public/forms/f2848.pdf")
const BINDING_PATH = resolve(process.cwd(), "src/lib/forms/pdf-bindings/2848/2021-01.json")
const OUT_PATH = resolve(process.cwd(), "scripts/.tmp/2848-smoke-output.pdf")

const SAMPLE = {
  taxpayer_name: "TESTLAST, TESTFIRST",
  ssn: "123456789",
  address_street: "123 Test Lane, Springfield IL 62701",
  daytime_phone: "5555551234",
  plan_number: "",
  representatives: [
    {
      rep_name: "Jane Q. Practitioner, EA",
      rep_address: "456 Practice Way, Springfield IL 62701",
      rep_caf_number: "1234-56789R",
      rep_ptin: "P12345678",
      rep_phone: "5555550100",
      rep_fax: "5555550101",
      rep_designation: "c",
      rep_jurisdiction: "EA",
      rep_bar_license_number: "00112233",
      rep_signature_date: "2026-04-28",
    },
    {
      rep_name: "Bob R. Attorney",
      rep_address: "789 Law St, Springfield IL 62701",
      rep_caf_number: "9876-54321A",
      rep_ptin: "P98765432",
      rep_phone: "5555550200",
      rep_fax: "",
      rep_designation: "a",
      rep_jurisdiction: "Illinois",
      rep_bar_license_number: "IL-987654",
      rep_signature_date: "2026-04-28",
    },
  ],
  tax_matters: [
    { tm_description: "Income", tm_tax_form_number: "1040", tm_years_or_periods: "2019-2022" },
    { tm_description: "Employment", tm_tax_form_number: "941", tm_years_or_periods: "202103, 202104" },
  ],
  other_acts_description: "Receive notices of deficiency on taxpayer's behalf.",
  specific_acts_not_authorized: "Sign returns; receive refund checks.",
  prior_2848_revoked: false,
  taxpayer_signature_name: "TESTLAST, TESTFIRST",
}

function flattenValues(values) {
  const out = {}
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val)) {
      val.forEach((entry, idx) => {
        if (entry && typeof entry === "object") {
          for (const [subKey, subVal] of Object.entries(entry)) {
            out[`${key}.${idx}.${subKey}`] = subVal
          }
        }
      })
    } else {
      out[key] = val
    }
  }
  return out
}

function applyTransform(value, transform) {
  if (value === null || value === undefined) return ""
  const str = String(value)
  switch (transform) {
    case "ssn-format":
      return str.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4}).*/, "$1-$2-$3")
    case "ein-format":
      return str.replace(/\D/g, "").replace(/^(\d{2})(\d{7}).*/, "$1-$2")
    case "phone-format": {
      const d = str.replace(/\D/g, "")
      return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : str
    }
    case "date-mmddyyyy": {
      const d = new Date(str)
      if (isNaN(d.getTime())) return str
      return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`
    }
    default:
      return str
  }
}

const pdfBytes = await readFile(PDF_PATH)
const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
const form = pdfDoc.getForm()
const actualFields = new Set(form.getFields().map((f) => f.getName()))

const binding = JSON.parse(await readFile(BINDING_PATH, "utf-8"))
const flat = flattenValues(SAMPLE)

let bindingTotal = 0
const missing = []
const filled = []
const skipped = []
const failed = []

for (const [fieldId, fb] of Object.entries(binding.fields)) {
  if (!fb.acro) continue
  bindingTotal++
  const name = fb.acro.acroFieldName

  if (!actualFields.has(name)) {
    missing.push({ fieldId, acroFieldName: name })
    continue
  }

  const value = flat[fieldId]
  if (value === undefined || value === null || value === "") {
    skipped.push(fieldId)
    continue
  }

  const display = applyTransform(value, fb.transform)
  try {
    const acroType = fb.acro.acroFieldType || "text"
    if (acroType === "checkbox") {
      const cb = form.getCheckBox(name)
      if (value === true || value === "true" || value === "yes" || value === 1) cb.check()
      else cb.uncheck()
    } else {
      const tf = form.getTextField(name)
      tf.setText(String(display))
    }
    filled.push(fieldId)
  } catch (err) {
    failed.push({ fieldId, error: err.message?.slice(0, 120) })
  }
}

await mkdir(dirname(OUT_PATH), { recursive: true })
const out = await pdfDoc.save()
await writeFile(OUT_PATH, out)

console.log("─".repeat(70))
console.log(`PDF:              ${PDF_PATH}`)
console.log(`Binding:          ${BINDING_PATH}`)
console.log(`AcroForm fields:  ${actualFields.size}`)
console.log(`Binding entries:  ${bindingTotal}`)
console.log(`  filled:         ${filled.length}`)
console.log(`  skipped (no value in sample): ${skipped.length}`)
console.log(`  failed at fill: ${failed.length}`)
console.log(`  missing in PDF: ${missing.length}`)
console.log("")
if (missing.length) {
  console.log("MISSING FIELDS (binding refers to names absent from PDF):")
  for (const m of missing) console.log(`  - ${m.fieldId} -> ${m.acroFieldName}`)
}
if (failed.length) {
  console.log("\nFAILED FILLS:")
  for (const f of failed) console.log(`  - ${f.fieldId}: ${f.error}`)
}
console.log("")
console.log(`Output PDF:       ${OUT_PATH}`)
console.log("─".repeat(70))

process.exit(missing.length > 0 || failed.length > 0 ? 1 : 0)
