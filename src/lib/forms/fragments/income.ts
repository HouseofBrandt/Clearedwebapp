import type { FieldDef } from "../types"

export const MONTHLY_INCOME_FIELDS: FieldDef[] = [
  {
    id: "income_wages",
    label: "Wages / Salary",
    type: "currency",
    irsReference: "Line 45",
    helpText: "Gross monthly wages before deductions",
  },
  {
    id: "income_ss",
    label: "Social Security Benefits",
    type: "currency",
    irsReference: "Line 46",
  },
  {
    id: "income_pension",
    label: "Pension / Annuity",
    type: "currency",
    irsReference: "Line 47",
  },
  {
    id: "income_self_employment",
    label: "Self-Employment Income",
    type: "currency",
    irsReference: "Line 48",
  },
  {
    id: "income_rental",
    label: "Rental Income",
    type: "currency",
    irsReference: "Line 49",
  },
  {
    id: "income_interest_dividends",
    label: "Interest & Dividends",
    type: "currency",
    irsReference: "Line 50",
  },
  {
    id: "income_distributions",
    label: "Distributions",
    type: "currency",
    irsReference: "Line 51",
  },
  {
    id: "income_child_support",
    label: "Child Support Received",
    type: "currency",
    irsReference: "Line 52a",
  },
  {
    id: "income_alimony",
    label: "Alimony Received",
    type: "currency",
    irsReference: "Line 52b",
  },
  {
    id: "income_other",
    label: "Other Income",
    type: "currency",
    irsReference: "Line 53",
  },
  {
    id: "total_monthly_income",
    label: "Total Monthly Income",
    type: "computed",
    irsReference: "Line 54",
    computeFormula: "income_wages + income_ss + income_pension + income_self_employment + income_rental + income_interest_dividends + income_distributions + income_child_support + income_alimony + income_other",
    dependsOn: [
      "income_wages", "income_ss", "income_pension", "income_self_employment",
      "income_rental", "income_interest_dividends", "income_distributions",
      "income_child_support", "income_alimony", "income_other",
    ],
  },
]
