import type { FieldDef } from "../types"

// Installment-agreement payment schedule. Used by Form 9465 (IA Request)
// and Form 433-D (IA signed form). Direct-debit bank info is NEVER
// pre-populated from other forms — the taxpayer provides it manually for
// the IA specifically.

export const INSTALLMENT_SCHEDULE_FIELDS: FieldDef[] = [
  {
    id: "ia_total_owed",
    label: "Total Amount Owed",
    type: "currency",
    required: true,
    helpText: "Sum of all tax, penalties, and interest across covered periods.",
  },
  {
    id: "ia_amount_paid_with_request",
    label: "Amount Paid With This Request",
    type: "currency",
    helpText: "Any partial payment included with the 9465. Reduces the balance for IA purposes.",
  },
  {
    id: "ia_monthly_amount",
    label: "Proposed Monthly Payment",
    type: "currency",
    required: true,
    helpText: "Must be at least sufficient to pay the balance within 72 months (streamlined IA) or 84 months (guaranteed IA under $10K).",
  },
  {
    id: "ia_payment_day_of_month",
    label: "Day of Month for Payment",
    type: "text",
    placeholder: "e.g., 15",
    required: true,
    validation: [
      { type: "pattern", value: "^([1-9]|1[0-9]|2[0-8])$", message: "Must be between 1 and 28" },
    ],
    helpText: "Choose between 1 and 28 to avoid short-month issues.",
  },
  {
    id: "ia_direct_debit_enabled",
    label: "Use Direct Debit (DDIA)",
    type: "yes_no",
    helpText: "DDIAs are strongly preferred by the IRS — reduces user fee, required for balances over $25K.",
  },
  {
    id: "ia_bank_routing",
    label: "Bank Routing Number",
    type: "text",
    helpText: "For direct debit only. 9 digits. Never pre-populated from other forms.",
    validation: [
      { type: "pattern", value: "^\\d{9}$", message: "Routing number must be 9 digits" },
    ],
    conditionals: [
      { field: "ia_direct_debit_enabled", operator: "equals", value: true, action: "show" },
    ],
  },
  {
    id: "ia_bank_account",
    label: "Bank Account Number",
    type: "text",
    helpText: "For direct debit only. Never pre-populated.",
    conditionals: [
      { field: "ia_direct_debit_enabled", operator: "equals", value: true, action: "show" },
    ],
  },
  {
    id: "ia_bank_account_type",
    label: "Account Type",
    type: "single_select",
    options: [
      { value: "checking", label: "Checking" },
      { value: "savings",  label: "Savings" },
    ],
    conditionals: [
      { field: "ia_direct_debit_enabled", operator: "equals", value: true, action: "show" },
    ],
  },
]
