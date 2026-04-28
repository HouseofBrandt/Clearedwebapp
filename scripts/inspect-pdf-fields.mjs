#!/usr/bin/env node
/**
 * inspect-pdf-fields.mjs
 *
 * Dump every AcroForm field on a PDF — name, type, page index, and a short
 * snapshot of the field's current value or options. Used when authoring a new
 * binding under src/lib/forms/pdf-bindings/{form}/{revision}.json: the binding
 * needs the exact dotted field names, which the IRS does not publish.
 *
 * Usage:
 *   node scripts/inspect-pdf-fields.mjs <path-to-pdf> [--format=text|json|csv]
 *
 * Examples:
 *   node scripts/inspect-pdf-fields.mjs public/forms/f433aoic.pdf
 *   node scripts/inspect-pdf-fields.mjs public/forms/f2848.pdf --format=json > 2848-fields.json
 *
 * The script also reports page count and dimensions, which are required when
 * filling in pageDimensions[] in the binding fixture.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { PDFDocument } from "pdf-lib"

const args = process.argv.slice(2)
const pdfArg = args.find((a) => !a.startsWith("--"))
const formatArg = args.find((a) => a.startsWith("--format="))
const format = formatArg ? formatArg.split("=")[1] : "text"

if (!pdfArg) {
  console.error("Usage: node scripts/inspect-pdf-fields.mjs <pdf-path> [--format=text|json|csv]")
  process.exit(1)
}

const pdfPath = resolve(process.cwd(), pdfArg)

let bytes
try {
  bytes = await readFile(pdfPath)
} catch (err) {
  console.error(`Failed to read PDF at ${pdfPath}: ${err.message}`)
  process.exit(1)
}

let pdfDoc
try {
  pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
} catch (err) {
  console.error(`Failed to parse PDF: ${err.message}`)
  process.exit(1)
}

const pages = pdfDoc.getPages()
const pageDimensions = pages.map((p) => {
  const { width, height } = p.getSize()
  return { width, height }
})

let form
try {
  form = pdfDoc.getForm()
} catch (err) {
  console.error(`PDF has no AcroForm: ${err.message}`)
  process.exit(2)
}

const fields = form.getFields()

// Build a map of page-ref → page-index so we can report which page each field lives on.
const pageRefs = new Map()
pages.forEach((p, idx) => {
  pageRefs.set(p.ref.tag, idx)
})

const records = fields.map((field) => {
  const ctor = field.constructor.name
  const type = ctor.replace(/^PDF/, "").toLowerCase()
  const name = field.getName()

  // Best-effort: figure out which page the first widget annotation is on.
  let page = -1
  try {
    const widgets = field.acroField.getWidgets()
    if (widgets.length > 0) {
      const pageRef = widgets[0].P()
      if (pageRef) {
        const idx = pageRefs.get(pageRef.tag)
        if (idx !== undefined) page = idx
      }
    }
  } catch {
    // Some fields don't expose widgets cleanly — leave page as -1.
  }

  let extra = {}
  try {
    if (type === "textfield") {
      extra.value = field.getText() ?? ""
    } else if (type === "checkbox") {
      extra.checked = field.isChecked()
    } else if (type === "radiogroup") {
      extra.options = field.getOptions()
      extra.selected = field.getSelected()
    } else if (type === "dropdown") {
      extra.options = field.getOptions()
      extra.selected = field.getSelected()
    } else if (type === "optionlist") {
      extra.options = field.getOptions()
      extra.selected = field.getSelected()
    }
  } catch {
    // Reading the field value can throw on malformed PDFs — ignore.
  }

  return { name, type, page, ...extra }
})

if (format === "json") {
  console.log(JSON.stringify({
    pdfPath,
    pageCount: pages.length,
    pageDimensions,
    fieldCount: records.length,
    fields: records,
  }, null, 2))
} else if (format === "csv") {
  console.log("name,type,page,value")
  for (const r of records) {
    const value = r.value ?? r.checked ?? r.selected ?? ""
    const escaped = String(value).replace(/"/g, '""')
    console.log(`"${r.name.replace(/"/g, '""')}",${r.type},${r.page},"${escaped}"`)
  }
} else {
  console.log(`PDF:        ${pdfPath}`)
  console.log(`Pages:      ${pages.length}`)
  console.log(`Dimensions: ${pageDimensions.map((d) => `${d.width}x${d.height}`).join(", ")}`)
  console.log(`Fields:     ${records.length}`)
  console.log("")
  console.log("─".repeat(120))
  for (const r of records) {
    const pageLabel = r.page >= 0 ? `p${r.page}` : "p?"
    let suffix = ""
    if (r.options) suffix = ` [${r.options.join(", ")}]`
    else if (r.value) suffix = ` = ${JSON.stringify(r.value).slice(0, 60)}`
    else if (r.checked !== undefined) suffix = ` = ${r.checked ? "checked" : "unchecked"}`
    console.log(`${pageLabel.padEnd(4)} ${r.type.padEnd(13)} ${r.name}${suffix}`)
  }
}
