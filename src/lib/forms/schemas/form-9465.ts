import type { FormSchema } from "../types"
import { TAXPAYER_NAME_FIELD, SSN_FIELD, SPOUSE_NAME_FIELD, SPOUSE_SSN_FIELD, EIN_FIELD } from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { HOME_PHONE_FIELD, WORK_PHONE_FIELD } from "../fragments/phone"

/**
 * IRS Form 9465 — Installment Agreement Request
 *
 * Most commonly used form for setting up monthly payments on a balance due.
 * Should be filed with the tax return when balance is owed, or separately for
 * existing balances. Online Payment Agreement (OPA) is preferred for balances
 * under $50,000 — Form 9465 is the paper alternative.
 *
 * Revision: September 2020 (the most current version).
 */

export const FORM_9465: FormSchema = {
  formNumber: "9465",
  formTitle: "Installment Agreement Request",
  revisionDate: "September 2020",
  ombNumber: "1545-0074",
  totalSections: 5,
  estimatedMinutes: 15,
  resolutionMetadata: {
    resolutionPaths: ["installment_agreement"],
    requirementLevel: { installment_agreement: "required" },
    dependsOn: [],
    requiredBy: [],
    dataSources: ["case", "433-A"],
    dataTargets: [],
  },

  sections: [
    // ── Section 1: Taxpayer Identification ───────────────────────────────
    {
      id: "taxpayer_info",
      title: "Taxpayer Identification",
      order: 1,
      fields: [
        TAXPAYER_NAME_FIELD,
        SSN_FIELD,
        SPOUSE_NAME_FIELD,
        SPOUSE_SSN_FIELD,
        ...US_ADDRESS_FIELDS,
        {
          id: "address_changed",
          label: "Has your address changed since you last filed?",
          type: "yes_no",
          irsReference: "Line 1c",
        },
        HOME_PHONE_FIELD,
        WORK_PHONE_FIELD,
        EIN_FIELD,
        {
          id: "name_of_business",
          label: "Name of your business (if self-employed and out of business)",
          type: "text",
          irsReference: "Line 3",
        },
      ],
    },

    // ── Section 2: Tax Periods Covered ───────────────────────────────────
    {
      id: "tax_periods",
      title: "Tax Periods Covered by This Agreement",
      order: 2,
      fields: [
        {
          id: "tax_form_number",
          label: "Tax Form Number",
          type: "text",
          required: true,
          irsReference: "Line 5",
          placeholder: "e.g. 1040, 941, 1120",
          helpText: "Enter the form for which you owe tax (1040 for individual, 941 for payroll, etc.)",
        },
        {
          id: "tax_year",
          label: "Tax Year(s) or Period(s)",
          type: "text",
          required: true,
          irsReference: "Line 6",
          placeholder: "e.g. 2023, or 12/2022 6/2023",
          helpText: "List the tax year(s) or period(s) for which you owe.",
        },
        {
          id: "amount_owed",
          label: "Total Amount You Owe",
          type: "currency",
          required: true,
          irsReference: "Line 7",
          helpText: "From your tax return or most recent IRS notice. Includes tax, penalties, and interest.",
        },
        {
          id: "amount_paid_with_return",
          label: "Amount You Are Paying with Your Return / Today",
          type: "currency",
          irsReference: "Line 8",
          helpText: "Any payment you're making now to reduce the balance.",
        },
        {
          id: "amount_for_installment",
          label: "Amount of the Installment Agreement (Balance to Pay)",
          type: "computed",
          computeFormula: "amount_owed - amount_paid_with_return",
          dependsOn: ["amount_owed", "amount_paid_with_return"],
          irsReference: "Line 9",
          helpText: "Auto-calculated: amount owed minus amount being paid now.",
        },
      ],
    },

    // ── Section 3: Proposed Installment Terms ────────────────────────────
    {
      id: "installment_terms",
      title: "Proposed Installment Terms",
      irsInstructions:
        "Choose a monthly amount that pays the balance within 72 months (6 years), or the full amount within the Collection Statute Expiration Date (CSED), whichever is earlier.",
      order: 3,
      fields: [
        {
          id: "monthly_payment_amount",
          label: "Proposed Monthly Payment Amount",
          type: "currency",
          required: true,
          irsReference: "Line 11a",
          helpText:
            "Minimum monthly payment is the balance ÷ 72. For balances under $50,000 the IRS often accepts what you propose. Higher balances may require Form 433-F.",
        },
        {
          id: "payment_due_day",
          label: "Day of Month for Payment (1–28)",
          type: "text",
          required: true,
          irsReference: "Line 11b",
          validation: [
            { type: "required", message: "Payment day is required" },
            { type: "pattern", value: "^([1-9]|1[0-9]|2[0-8])$", message: "Must be 1–28" },
          ],
          helpText: "Pick a day between 1 and 28 of the month for the IRS to debit / receive your payment.",
        },
        {
          id: "minimum_payment_calc",
          label: "IRS Minimum Acceptable Payment (Balance ÷ 72)",
          type: "computed",
          computeFormula: "amount_for_installment / 72",
          dependsOn: ["amount_for_installment"],
          helpText: "If your proposed payment is below this, the IRS may require Form 433-F.",
        },
      ],
    },

    // ── Section 4: Payment Method ────────────────────────────────────────
    {
      id: "payment_method",
      title: "Payment Method",
      order: 4,
      fields: [
        {
          id: "payment_method_type",
          label: "Payment Method",
          type: "single_select",
          required: true,
          irsReference: "Line 13",
          options: [
            { value: "direct_debit", label: "Direct Debit (recommended — required for balances over $25,000)" },
            { value: "payroll_deduction", label: "Payroll Deduction (Form 2159 also required)" },
            { value: "check_money_order", label: "Check or Money Order (mailed monthly)" },
            { value: "online", label: "Online Payment / EFTPS" },
            { value: "credit_debit_card", label: "Credit / Debit Card (third-party processor)" },
          ],
        },
        {
          id: "bank_routing_number",
          label: "Bank Routing Number (for Direct Debit)",
          type: "text",
          irsReference: "Line 13a",
          validation: [
            { type: "pattern", value: "^\\d{9}$", message: "Routing number must be 9 digits" },
          ],
          conditionals: [
            { field: "payment_method_type", operator: "equals", value: "direct_debit", action: "show" },
          ],
        },
        {
          id: "bank_account_number",
          label: "Bank Account Number (for Direct Debit)",
          type: "text",
          irsReference: "Line 13b",
          conditionals: [
            { field: "payment_method_type", operator: "equals", value: "direct_debit", action: "show" },
          ],
        },
        {
          id: "bank_account_type",
          label: "Account Type",
          type: "single_select",
          irsReference: "Line 13c",
          options: [
            { value: "checking", label: "Checking" },
            { value: "savings", label: "Savings" },
          ],
          conditionals: [
            { field: "payment_method_type", operator: "equals", value: "direct_debit", action: "show" },
          ],
        },
      ],
    },

    // ── Section 5: Signatures ────────────────────────────────────────────
    {
      id: "signatures",
      title: "Signatures",
      order: 5,
      fields: [
        {
          id: "taxpayer_signature",
          label: "Taxpayer Signature",
          type: "text",
          required: true,
        },
        {
          id: "taxpayer_signature_date",
          label: "Date Signed",
          type: "date",
          required: true,
        },
        {
          id: "spouse_signature",
          label: "Spouse Signature (if MFJ)",
          type: "text",
          conditionals: [
            { field: "spouse_name", operator: "is_not_empty", value: null, action: "show" },
          ],
        },
        {
          id: "spouse_signature_date",
          label: "Spouse Date Signed",
          type: "date",
          conditionals: [
            { field: "spouse_name", operator: "is_not_empty", value: null, action: "show" },
          ],
        },
      ],
    },
  ],

  crossFieldValidations: [
    {
      id: "monthly_payment_meets_minimum",
      description:
        "Monthly payment should pay off balance within 72 months (or trigger 433-F)",
      fields: ["monthly_payment_amount", "amount_for_installment"],
      rule: "monthly_payment_amount * 72 >= amount_for_installment",
      errorMessage:
        "Proposed payment may not pay the balance within 72 months. The IRS will likely require Form 433-F (Collection Information Statement) to evaluate ability to pay.",
      severity: "warning",
    },
    {
      id: "direct_debit_required_over_25k",
      description: "Direct debit required for installment agreements over $25,000",
      fields: ["amount_for_installment", "payment_method_type"],
      rule: "if amount_for_installment > 25000 then payment_method_type == 'direct_debit'",
      errorMessage:
        "Installment agreements for balances over $25,000 require direct debit (electronic withdrawal).",
      severity: "error",
    },
  ],
}
