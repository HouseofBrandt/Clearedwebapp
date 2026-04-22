import { runExtractor } from "./_shared"

export async function extract1040(text: string) {
  return runExtractor({
    documentText: text,
    documentLabel: "Form 1040 (US Individual Income Tax Return)",
    schemaDescription: `{
  tax_year: number,                        // e.g., 2023
  filing_status: "single" | "MFJ" | "MFS" | "HOH" | "QSS" | null,
  taxpayer_name: string | null,
  taxpayer_ssn: string | null,              // formatted NNN-NN-NNNN
  spouse_name: string | null,
  spouse_ssn: string | null,
  address_street: string | null,
  address_city: string | null,
  address_state: string | null,
  address_zip: string | null,
  dependents_count: number | null,
  total_income: number | null,              // Line 9
  agi: number | null,                       // Line 11 — Adjusted Gross Income
  standard_or_itemized: "standard" | "itemized" | null,
  deduction_amount: number | null,          // Line 12
  taxable_income: number | null,            // Line 15
  total_tax: number | null,                 // Line 24
  total_payments: number | null,            // Line 33
  refund_or_due: number | null,             // Line 34 (positive) or Line 37 (negative = due)
  wages: number | null,                     // Line 1a (W-2 wages)
  interest_income: number | null,           // Line 2a + 2b
  dividends: number | null,                 // Line 3a + 3b
  ira_distributions: number | null,         // Line 4a/b
  pensions_annuities: number | null,        // Line 5a/b
  social_security_benefits: number | null,  // Line 6a/b
  capital_gain_loss: number | null,         // Line 7
  business_income: number | null,           // Schedule C net
  _confidence: number
}`,
    exampleJson: {
      tax_year: 2023,
      filing_status: "MFJ",
      taxpayer_name: "Jane Doe",
      taxpayer_ssn: "123-45-6789",
      spouse_name: "John Doe",
      spouse_ssn: "987-65-4321",
      address_street: "123 Main St",
      address_city: "Portland",
      address_state: "OR",
      address_zip: "97201",
      dependents_count: 2,
      total_income: 85000,
      agi: 82000,
      standard_or_itemized: "standard",
      deduction_amount: 27700,
      taxable_income: 54300,
      total_tax: 6110,
      total_payments: 7200,
      refund_or_due: 1090,
      wages: 75000,
      interest_income: 120,
      dividends: 450,
      ira_distributions: null,
      pensions_annuities: null,
      social_security_benefits: null,
      capital_gain_loss: null,
      business_income: 9430,
      _confidence: 0.92,
    },
  })
}
