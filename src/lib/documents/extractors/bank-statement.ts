import { runExtractor } from "./_shared"

export async function extractBankStatement(text: string) {
  return runExtractor({
    documentText: text,
    documentLabel: "Bank Statement (checking, savings, or money-market)",
    schemaDescription: `{
  institution_name: string | null,
  account_holder_name: string | null,
  account_number_last4: string | null,        // only the last 4 digits; do NOT include full account numbers
  account_type: "checking" | "savings" | "money_market" | "cd" | null,
  statement_start_date: string | null,        // ISO YYYY-MM-DD
  statement_end_date: string | null,
  opening_balance: number | null,
  closing_balance: number | null,
  total_deposits: number | null,
  total_withdrawals: number | null,
  average_daily_balance: number | null,
  overdraft_fees_charged: number | null,
  direct_deposit_indicators: string[] | null, // e.g., ["Employer: ACME CORP", "IRS TREAS 310"]
  large_transactions: Array<{
    date: string | null,
    description: string | null,
    amount: number | null,
  }> | null,
  _confidence: number
}`,
    exampleJson: {
      institution_name: "Chase",
      account_holder_name: "Jane Doe",
      account_number_last4: "1234",
      account_type: "checking",
      statement_start_date: "2024-03-01",
      statement_end_date: "2024-03-31",
      opening_balance: 2403.12,
      closing_balance: 1987.44,
      total_deposits: 6200,
      total_withdrawals: 6615.68,
      average_daily_balance: 2100,
      overdraft_fees_charged: 0,
      direct_deposit_indicators: ["Employer: ACME CORP 03/15", "Employer: ACME CORP 03/29"],
      large_transactions: [
        { date: "2024-03-05", description: "Rent payment", amount: -2200 },
      ],
      _confidence: 0.88,
    },
  })
}
