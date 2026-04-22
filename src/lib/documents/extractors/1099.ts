import { runExtractor } from "./_shared"

export async function extract1099(text: string) {
  return runExtractor({
    documentText: text,
    documentLabel: "Form 1099 (any variant: MISC, NEC, INT, DIV, R, G, K, etc.)",
    schemaDescription: `{
  tax_year: number,
  form_variant: "MISC" | "NEC" | "INT" | "DIV" | "R" | "G" | "K" | "B" | "OID" | "SA" | null,
  payer_name: string | null,
  payer_tin: string | null,
  recipient_name: string | null,
  recipient_tin: string | null,
  // Variant-specific amounts — populate only the ones relevant to form_variant:
  nonemployee_compensation: number | null,     // 1099-NEC Box 1
  other_income: number | null,                 // 1099-MISC Box 3
  rents: number | null,                        // 1099-MISC Box 1
  royalties: number | null,                    // 1099-MISC Box 2
  interest_income: number | null,              // 1099-INT Box 1
  early_withdrawal_penalty: number | null,     // 1099-INT Box 2
  ordinary_dividends: number | null,           // 1099-DIV Box 1a
  qualified_dividends: number | null,          // 1099-DIV Box 1b
  gross_distribution: number | null,           // 1099-R Box 1
  taxable_amount: number | null,               // 1099-R Box 2a
  federal_withholding: number | null,          // Box 4 (multiple variants)
  _confidence: number
}`,
    exampleJson: {
      tax_year: 2023,
      form_variant: "NEC",
      payer_name: "Beacon Consulting LLC",
      payer_tin: "12-3456789",
      recipient_name: "Jane Doe",
      recipient_tin: "123-45-6789",
      nonemployee_compensation: 24000,
      other_income: null,
      rents: null,
      royalties: null,
      interest_income: null,
      early_withdrawal_penalty: null,
      ordinary_dividends: null,
      qualified_dividends: null,
      gross_distribution: null,
      taxable_amount: null,
      federal_withholding: 0,
      _confidence: 0.9,
    },
  })
}
