import { runExtractor } from "./_shared"

export async function extractIRSNotice(text: string) {
  return runExtractor({
    documentText: text,
    documentLabel: "IRS notice or letter (CP, LT, or numbered IRS correspondence)",
    schemaDescription: `{
  notice_number: string | null,              // e.g., "CP504", "LT11", "CP2000"
  notice_date: string | null,                // ISO YYYY-MM-DD
  tax_year: number | null,                   // year the notice pertains to
  tax_form: string | null,                   // e.g., "1040", "941"
  taxpayer_name: string | null,
  taxpayer_tin: string | null,
  amount_due: number | null,                 // the total amount the notice demands, if any
  response_deadline: string | null,          // ISO YYYY-MM-DD
  notice_category:
    "balance_due" | "cp2000_proposal" | "levy_intent" | "lien_notice" |
    "cdp_rights" | "return_selected_audit" | "math_error" | "missing_return" |
    "installment_default" | "refund" | "other" | null,
  collection_action_indicated:
    "levy_intent" | "levy" | "lien_filed" | "none" | null,
  cdp_rights_present: boolean | null,        // true if the notice carries CDP appeal rights
  summary: string | null,                    // 1-2 sentence plain-English summary
  _confidence: number
}`,
    exampleJson: {
      notice_number: "CP504",
      notice_date: "2026-03-15",
      tax_year: 2022,
      tax_form: "1040",
      taxpayer_name: "Jane Doe",
      taxpayer_tin: "123-45-6789",
      amount_due: 14782.33,
      response_deadline: "2026-04-14",
      notice_category: "levy_intent",
      collection_action_indicated: "levy_intent",
      cdp_rights_present: false,
      summary: "Final notice before levy of state refund and other assets for unpaid 2022 1040 balance.",
      _confidence: 0.93,
    },
  })
}
