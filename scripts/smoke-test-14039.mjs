#!/usr/bin/env node
/**
 * smoke-test-14039.mjs — verifies every binding entry resolves to a real
 * AcroForm field on f14039.pdf, then fills a synthetic instance to /tmp.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { PDFDocument } from "pdf-lib"

const PDF_PATH = resolve(process.cwd(), "public/forms/f14039.pdf")
const BINDING_PATH = resolve(process.cwd(), "src/lib/forms/pdf-bindings/14039/2022-12.json")
const OUT_PATH = resolve(process.cwd(), "scripts/.tmp/14039-smoke-output.pdf")

const SAMPLE = {
  circumstances:
    "On Jan 15 our client received an IRS letter rejecting the 2024 e-file because someone had already filed a return using the SSN. We pulled a wage and income transcript that showed an unfamiliar employer for that year, confirming SSN misuse.",
  taxpayer_name: "TESTLAST",
  ssn: "123456789",
  address_street: "123 Test Lane",
  address_city: "Springfield",
  address_state: "IL",
  address_zip: "62701",
  phone: "5555551234",
  taxpayer_signature_name: "TESTLAST",
  taxpayer_signature_date: "2026-04-29",
}

function flattenValues(values) {
  const out = {}
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) {
      v.forEach((entry, i) => {
        if (entry && typeof entry === "object") {
          for (const [sk, sv] of Object.entries(entry)) out[`${k}.${i}.${sk}`] = sv
        }
      })
    } else out[k] = v
  }
  return out
}

function applyTransform(value, transform) {
  if (value === null || value === undefined) return ""
  const s = String(value)
  switch (transform) {
    case "ssn-format": return s.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4}).*/, "$1-$2-$3")
    case "phone-format": {
      const d = s.replace(/\D/g, "")
      return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : s
    }
    case "date-mmddyyyy": {
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`
    }
    default: return s
  }
}

const pdfBytes = await readFile(PDF_PATH)
const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
const form = pdfDoc.getForm()
const actual = new Set(form.getFields().map((f) => f.getName()))
const binding = JSON.parse(await readFile(BINDING_PATH, "utf-8"))
const flat = flattenValues(SAMPLE)

let bindingTotal = 0, filled = 0, skipped = 0
const missing = [], failed = []

for (const [fieldId, fb] of Object.entries(binding.fields)) {
  if (!fb.acro) continue
  bindingTotal++
  const name = fb.acro.acroFieldName
  if (!actual.has(name)) { missing.push({ fieldId, acroFieldName: name }); continue }
  const value = flat[fieldId]
  if (value === undefined || value === null || value === "") { skipped++; continue }
  const display = applyTransform(value, fb.transform)
  try {
    const t = fb.acro.acroFieldType || "text"
    if (t === "checkbox") {
      const cb = form.getCheckBox(name)
      if (value === true || value === "true" || value === "yes" || value === 1) cb.check(); else cb.uncheck()
    } else if (t === "dropdown") {
      const dd = form.getDropdown(name)
      try { dd.select(String(display)) } catch { dd.select(String(display).toUpperCase()) }
    } else {
      form.getTextField(name).setText(String(display))
    }
    filled++
  } catch (e) { failed.push({ fieldId, error: e.message?.slice(0, 120) }) }
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, await pdfDoc.save())

console.log("─".repeat(70))
console.log(`PDF:              ${PDF_PATH}`)
console.log(`Binding:          ${BINDING_PATH}`)
console.log(`AcroForm fields:  ${actual.size}`)
console.log(`Binding entries:  ${bindingTotal}`)
console.log(`  filled:         ${filled}`)
console.log(`  skipped:        ${skipped}`)
console.log(`  failed at fill: ${failed.length}`)
console.log(`  missing in PDF: ${missing.length}`)
if (missing.length) { console.log("\nMISSING:"); for (const m of missing) console.log(`  - ${m.fieldId} -> ${m.acroFieldName}`) }
if (failed.length) { console.log("\nFAILED:"); for (const f of failed) console.log(`  - ${f.fieldId}: ${f.error}`) }
console.log(`\nOutput PDF: ${OUT_PATH}`)
console.log("─".repeat(70))
process.exit(missing.length > 0 || failed.length > 0 ? 1 : 0)
