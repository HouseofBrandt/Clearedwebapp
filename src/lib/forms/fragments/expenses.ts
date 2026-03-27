import type { FieldDef } from "../types"

export const MONTHLY_EXPENSE_FIELDS: FieldDef[] = [
  {
    id: "expense_food_clothing",
    label: "Food, Clothing & Miscellaneous",
    type: "currency",
    irsReference: "Line 55",
  },
  {
    id: "expense_housing",
    label: "Housing & Utilities",
    type: "currency",
    irsReference: "Line 56",
  },
  {
    id: "expense_vehicle_ownership",
    label: "Vehicle Ownership (Loan/Lease)",
    type: "currency",
    irsReference: "Line 57",
  },
  {
    id: "expense_vehicle_operating",
    label: "Vehicle Operating Costs",
    type: "currency",
    irsReference: "Line 58",
  },
  {
    id: "expense_health_insurance",
    label: "Health Insurance",
    type: "currency",
    irsReference: "Line 60",
  },
  {
    id: "expense_medical",
    label: "Out-of-Pocket Medical/Dental",
    type: "currency",
    irsReference: "Line 61",
  },
  {
    id: "expense_court_ordered",
    label: "Court-Ordered Payments",
    type: "currency",
    irsReference: "Line 62",
  },
  {
    id: "expense_child_care",
    label: "Child/Dependent Care",
    type: "currency",
    irsReference: "Line 63",
  },
  {
    id: "expense_life_insurance",
    label: "Term Life Insurance",
    type: "currency",
    irsReference: "Line 64",
  },
  {
    id: "expense_taxes",
    label: "Current Tax Payments",
    type: "currency",
    irsReference: "Line 65",
    helpText: "Estimated tax, withholding, etc.",
  },
  {
    id: "expense_secured_debts",
    label: "Secured Debt Payments",
    type: "currency",
    irsReference: "Line 66",
  },
  {
    id: "expense_other",
    label: "Other Necessary Expenses",
    type: "currency",
    irsReference: "Line 67b",
  },
  {
    id: "total_monthly_expenses",
    label: "Total Monthly Expenses",
    type: "computed",
    irsReference: "Line 68",
    computeFormula: "expense_food_clothing + expense_housing + expense_vehicle_ownership + expense_vehicle_operating + expense_health_insurance + expense_medical + expense_court_ordered + expense_child_care + expense_life_insurance + expense_taxes + expense_secured_debts + expense_other",
    dependsOn: [
      "expense_food_clothing", "expense_housing", "expense_vehicle_ownership",
      "expense_vehicle_operating", "expense_health_insurance", "expense_medical",
      "expense_court_ordered", "expense_child_care", "expense_life_insurance",
      "expense_taxes", "expense_secured_debts", "expense_other",
    ],
  },
  {
    id: "remaining_monthly_income",
    label: "Net Remaining Income",
    type: "computed",
    irsReference: "Line 69",
    computeFormula: "total_monthly_income - total_monthly_expenses",
    dependsOn: ["total_monthly_income", "total_monthly_expenses"],
    helpText: "Total Monthly Income minus Total Monthly Expenses",
  },
]
