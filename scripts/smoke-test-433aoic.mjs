#!/usr/bin/env node
/**
 * smoke-test-433aoic.mjs
 *
 * Verify that every AcroForm field referenced by the 433-A-OIC binding exists
 * in the PDF, then fill the PDF with synthetic data and write the result to
 * /tmp so a human can eyeball it.
 *
 * Run:
 *   node scripts/smoke-test-433aoic.mjs
 *
 * Exits non-zero if the binding references field names that don't exist in
 * the PDF — that's the failure mode we care about most. A clean pass means
 * the binding is structurally sound.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { PDFDocument } from "pdf-lib"

const PDF_PATH = resolve(process.cwd(), "public/forms/f433aoic.pdf")
const BINDING_PATH = resolve(process.cwd(), "src/lib/forms/pdf-bindings/433-A-OIC/2024-04.json")
const OUT_PATH = resolve(process.cwd(), "scripts/.tmp/433aoic-smoke-output.pdf")

const SAMPLE = {
  taxpayer_name: "TESTLAST",
  dob: "1980-01-15",
  ssn: "123456789",
  address_street: "123 Test Lane, Springfield IL 62701",
  county: "Sangamon",
  home_phone: "5555551234",
  cell_phone: "5555555678",
  spouse_name: "TESTSPOUSE",
  spouse_dob: "1982-06-03",
  spouse_ssn: "987654321",
  dependents: [
    { dep_name: "Kid One", dep_age: "10", dep_relationship: "Child" },
    { dep_name: "Kid Two", dep_age: "7", dep_relationship: "Child" },
  ],
  employers: [{ emp_name: "Acme Corp", emp_address: "1 Acme Way, Springfield IL" }],
  bank_accounts: [
    { bank_name: "Test Bank", bank_balance: 2500.50 },
    { bank_name: "Other Bank", bank_balance: 1100 },
  ],
  total_bank_balances: 3600.50,
  investments: [
    { inv_institution: "Vanguard", inv_balance: 25000, inv_loan: 0, inv_equity: 25000 },
  ],
  retirement_accounts: [
    { ret_institution: "Fidelity 401k", ret_balance: 75000, ret_loan: 5000 },
  ],
  life_insurance_csv: 8500,
  real_property: [
    {
      prop_description: "Primary residence",
      prop_address: "123 Test Lane, Springfield IL 62701",
      prop_fmv: 280000,
      prop_loan: 220000,
      prop_equity: 60000,
      prop_monthly_payment: 1850,
      prop_lender: "Springfield S&L",
    },
  ],
  vehicles: [
    {
      veh_year: "2018",
      veh_make: "Honda Civic",
      veh_mileage: "85000",
      veh_fmv: 12500,
      veh_loan: 4200,
      veh_equity: 8300,
      veh_monthly_payment: 320,
      veh_lender: "Honda Financial",
    },
  ],
  other_assets: [{ other_description: "Coin collection", other_fmv: 1200, other_loan: 0 }],
  business_name: "Test Self-Employed LLC",
  business_address: "456 Biz St, Springfield IL",
  business_phone: "5555559999",
  business_ein: "123456789",
  business_website: "test.example",
  business_type: "Consulting",
  number_employees: "0",
  business_bank_accounts: [{ bba_bank_name: "Biz Checking", bba_balance: 4500 }],
  business_gross_receipts: 6000,
  business_gross_profit: 6000,
  biz_exp_supplies: 200,
  biz_exp_rent: 800,
  biz_exp_utilities: 150,
  biz_exp_wages: 0,
  biz_exp_insurance: 100,
  biz_exp_total: 1250,
  business_net_income: 4750,
  income_wages_taxpayer: 5800,
  income_wages_spouse: 4200,
  income_ss_taxpayer: 0,
  income_ss_spouse: 0,
  income_pension_taxpayer: 0,
  income_pension_spouse: 0,
  income_other: 0,
  income_interest_dividends: 50,
  income_distributions: 0,
  income_rental: 0,
  income_self_employment: 4750,
  income_child_support: 0,
  income_alimony: 0,
  total_monthly_income: 14800,
  expense_food_clothing: 1700,
  expense_housing: 2200,
  expense_vehicle_ownership: 320,
  expense_vehicle_operating: 280,
  expense_public_transit: 0,
  expense_health_insurance: 450,
  expense_medical: 75,
  expense_court_ordered: 0,
  expense_child_care: 600,
  expense_life_insurance: 80,
  expense_taxes: 1100,
  expense_secured_debts: 0,
  expense_delinquent_state_taxes: 0,
  total_monthly_expenses: 6805,
  remaining_monthly_income: 7995,
  total_liability: 85000,
  total_asset_equity: 102100,
  future_income_lump: 95940,
  future_income_periodic: 191880,
  offer_amount: 105000,
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
    case "currency-no-symbol":
      return Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
