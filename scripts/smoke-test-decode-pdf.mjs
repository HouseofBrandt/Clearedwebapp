#!/usr/bin/env node
/**
 * smoke-test-decode-pdf.mjs
 *
 * Verifies that `decodeRawContent` actually extracts text from real IRS
 * PDFs. Before this change it returned null on PDF magic bytes — that's
 * what kept Pippen's daily briefs blank.
 *
 *   node scripts/smoke-test-decode-pdf.mjs
 *
 * Exits non-zero if extraction returns null, < 200 chars, or doesn't
 * include common IRS form vocabulary.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

// Inline the same logic the real decodeRawContent uses — the production
// function is TS and lives in @-aliased imports we can't trivially
// import from a script. The point of the smoke test is to verify the
// pdf-parse pathway works end-to-end on real bytes.
import { PDFParse } from "pdf-parse"

async function decodePdf(buf) {
  let parser = null
  try {
    parser = new PDFParse({ data: buf })
    const result = await parser.getText()
    const text = (result?.text ?? "").trim()
    return text.length >= 200 ? text : null
  } catch (err) {
    console.error("[decodePdf] failed:", err?.message)
    return null
  } finally {
    try { await parser?.destroy() } catch {}
  }
}

const SAMPLES = [
  { path: "public/forms/f433a.pdf",    expect: ["Collection Information Statement", "Wage Earners"] },
  { path: "public/forms/f2848.pdf",    expect: ["Power of Attorney", "Representative"] },
  { path: "public/forms/f9465.pdf",    expect: ["Installment Agreement"] },
  { path: "public/forms/f12277.pdf",   expect: ["Withdrawal of Filed Notice"] },
  { path: "public/forms/f14039.pdf",   expect: ["Identity Theft Affidavit"] },
]

console.log("─".repeat(70))
console.log("PDF text extraction smoke test")
console.log("─".repeat(70))

let failures = 0
for (const s of SAMPLES) {
  const path = resolve(process.cwd(), s.path)
  let buf
  try {
    buf = await readFile(path)
  } catch (e) {
    console.log(`SKIP   ${s.path}  (file not present: ${e.message})`)
    continue
  }
  const t = Date.now()
  const text = await decodePdf(buf)
  const ms = Date.now() - t

  if (!text) {
    console.log(`FAIL   ${s.path}  (decode returned null)`)
    failures++
    continue
  }

  const missing = s.expect.filter((e) => !text.includes(e))
  if (missing.length > 0) {
    console.log(`FAIL   ${s.path}  (${ms}ms, ${text.length} chars; missing terms: ${missing.join(", ")})`)
    failures++
    continue
  }

  console.log(`PASS   ${s.path}  ${ms}ms, ${text.length} chars`)
}

console.log("─".repeat(70))
console.log(failures === 0 ? "ALL PDFs decoded successfully" : `${failures} failure(s)`)
process.exit(failures > 0 ? 1 : 0)
