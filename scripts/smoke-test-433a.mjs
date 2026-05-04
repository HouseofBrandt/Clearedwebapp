#!/usr/bin/env node
/**
 * smoke-test-433a.mjs
 *
 * Verify that every AcroForm field referenced by the 433-A binding exists
 * in the PDF, then fill the PDF with realistic sample data and write the
 * result to /tmp so a human can eyeball it.
 *
 * Run:
 *   node scripts/smoke-test-433a.mjs
 *
 * Exits non-zero if the binding references field names that don't exist in
 * the PDF, OR if any binding entry fails at fill time.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { PDFDocument } from "pdf-lib"

const PDF_PATH     = resolve(process.cwd(), "public/forms/f433a.pdf")
const BINDING_PATH = resolve(process.cwd(), "src/lib/forms/pdf-bindings/433-A/2022-07.json")
const OUT_PATH     = resolve(process.cwd(), "scripts/.tmp/433a-smoke-output.pdf")

const SAMPLE = {
  taxpayer_name: "JANE TESTPAYER",
  ssn: "123456789",
  dob: "1980-05-15",
  address_street: "123 Test Lane, Springfield IL 62701",
  spouse_name: "JOHN TESTPAYER",
  spouse_ssn: "987654321",
  spouse_dob: "1981-08-22",
  dependents: [
    { dep_name: "Kid One",  dep_relationship: "Child" },
    { dep_name: "Kid Two",  dep_relationship: "Child" },
    { dep_name: "Parent A", dep_relationship: "Parent" },
  ],
  marital_status: "married",
  outside_business_interests: true,
  other_business_interests: [
    { obi_business_name: "Acme LLC", obi_ownership_percentage: "25", obi_title: "Member", obi_entity_type: "llc" },
  ],
  employers: [
    { emp_name: "Megacorp Inc.", emp_address: "1 Corporate Plaza, Springfield IL 62702",
      emp_gross_monthly: 8500, emp_net_monthly: 6200, emp_pay_frequency: "biweekly" },
  ],
  digital_assets: false,
  cash_on_hand: 350,
  bank_accounts: [
    { bank_name: "First National", bank_account_number: "1234", bank_balance: 4250.50 },
    { bank_name: "Credit Union",   bank_account_number: "5678", bank_balance: 1100 },
  ],
  total_bank_balances: 5350.50,
  investments: [
    { inv_institution: "Vanguard Brokerage", inv_account_number: "V12345",
      inv_balance: 35000, inv_loan: 0, inv_equity: 35000 },
  ],
  credit_cards: [
    { cc_institution: "Chase Visa", cc_account_number: "X1234",
      cc_credit_limit: 8000, cc_balance: 2500, cc_minimum_payment: 75 },
  ],
  life_insurance_csv: 12500,
  real_property: [
    { prop_description: "Primary residence",
      prop_address: "123 Test Lane, Springfield IL 62701",
      prop_fmv: 285000, prop_loan: 220000, prop_equity: 65000 },
  ],
  vehicles: [
    { veh_year: "2018", veh_mileage: "82000",
      veh_vin: "1HGCM82633A123456",
      veh_purchase_date: "2020-03-15",
      veh_fmv: 14500, veh_loan: 8200, veh_monthly_payment: 285,
      veh_payoff_date: "2026-09-30", veh_equity: 6300,
      veh_lender: "Honda Financial" },
  ],
  other_assets: [
    { other_purchase_date: "2018-06-01",
      other_fmv: 5000, other_loan: 0, other_monthly_payment: 0,
      other_payoff_date: "2025-12-31" },
  ],
  income_wages_taxpayer: 8500,
  income_wages_spouse: 4200,
  income_interest_dividends: 75,
  income_self_employment: 1200,
  income_rental: 850,
  income_distributions: 0,
  income_pension_taxpayer: 0,
  income_pension_spouse: 0,
  income_ss_taxpayer: 0,
  income_ss_spouse: 0,
  income_child_support: 0,
  income_alimony: 0,
  income_other: 0,
  total_monthly_income: 14825,
  expense_food_clothing: 1450,
  expense_housing: 2200,
  expense_vehicle_ownership: 285,
  expense_vehicle_operating: 320,
  expense_public_transit: 0,
  expense_health_insurance: 480,
  expense_medical: 75,
  expense_court_ordered: 0,
  expense_child_care: 600,
  expense_life_insurance: 80,
  expense_taxes: 1250,
  expense_secured_debts: 75,
  expense_delinquent_state_taxes: 0,
  expense_other: 200,
  total_monthly_expenses: 7015,
  remaining_monthly_income: 7810,
  business_name_formal: "Acme LLC",
  business_ein_formal: "871234567",
  business_website: "acme-llc.example.com",
  number_employees: "3",
  business_bank_accounts: [
    { bba_bank_name: "Business Checking", bba_balance: 12500 },
  ],
  business_accounts_receivable: 8500,
  business_vehicles: [
    { bv_year: "2019", bv_make: "Ford F-150", bv_fmv: 22000, bv_loan_balance: 14000 },
  ],
  business_equipment: [
    { be_description: "Computers", be_fmv: 5500, be_loan_balance: 0 },
  ],
  business_gross_receipts: 28500,
  business_gross_profit: 22500,
  biz_exp_total: 18200,
  business_net_income: 4300,
  biz_exp_advertising: 850,
  biz_exp_supplies: 425,
  biz_exp_wages: 12000,
  biz_exp_rent: 2500,
  biz_exp_utilities: 380,
  biz_exp_insurance: 295,
  biz_exp_other: 1750,
}

function flattenValues(obj, prefix = "", out = {}) {
  if (obj === null || obj === undefined) return out
  if (Array.isArray(obj)) {
    obj.forEach((entry, i) => flattenValues(entry, prefix ? `${prefix}.${i}` : String(i), out))
    return out
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      flattenValues(v, prefix ? `${prefix}.${k}` : k, out)
    }
    return out
  }
  out[prefix] = obj
  return out
}

function applyTransform(value, transform) {
  if (value === null || value === undefined) return ""
  const str = String(value)
  switch (transform) {
    case "ssn-format":
      return str.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4}).*/, "$1-$2-$3")
    case "ssn-digits":
      return str.replace(/\D/g, "").slice(0, 9)
    case "ein-format":
      return str.replace(/\D/g, "").replace(/^(\d{2})(\d{7}).*/, "$1-$2")
    case "ein-digits":
      return str.replace(/\D/g, "").slice(0, 9)
    case "phone-format": {
      const d = str.replace(/\D/g, "")
      return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : str
    }
    case "phone-digits":
      return str.replace(/\D/g, "").slice(0, 10)
    case "currency-no-symbol":
      return Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    case "date-mmddyyyy": {
      const d = new Date(str)
      if (isNaN(d.getTime())) return str
      return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`
    }
    case "date-mmddyyyy-nosep": {
      const d = new Date(str)
      if (isNaN(d.getTime())) return str
      return `${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}${d.getFullYear()}`
    }
    case "zip-first-5":
      return str.replace(/\D/g, "").slice(0, 5)
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

  const sourceId = fb.boundField || fieldId
  const value = flat[sourceId]
  if (value === undefined || value === null || value === "") {
    skipped.push(fieldId)
    continue
  }

  const display = applyTransform(value, fb.transform)
  try {
    const acroType = fb.acro.acroFieldType || "text"
    if (acroType === "checkbox") {
      const cb = form.getCheckBox(name)
      let shouldCheck
      if (fb.acro.checkWhen !== undefined) {
        shouldCheck = value === fb.acro.checkWhen
      } else if (fb.acro.checkWhenNot !== undefined) {
        shouldCheck = value !== fb.acro.checkWhenNot && value !== undefined && value !== null && value !== ""
      } else {
        shouldCheck = value === true || value === "true" || value === "yes" || value === 1
      }
      if (shouldCheck) cb.check()
      else cb.uncheck()
    } else {
      const tf = form.getTextField(name)
      const max = tf.getMaxLength?.()
      const txt = String(display)
      const safe = typeof max === "number" && max > 0 && txt.length > max ? txt.slice(0, max) : txt
      tf.setText(safe)
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
