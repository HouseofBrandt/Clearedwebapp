// ---------------------------------------------------------------------------
// Sample Form Templates — used for the Form Builder Hub display
// ---------------------------------------------------------------------------

import type { FormTemplate } from "@/types/forms"

/**
 * Sample templates for the Form Builder. In production these would be loaded
 * from the database; for now we keep a static registry so the UI has data.
 */
export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "433-a",
    formNumber: "433-A",
    title: "Collection Information Statement for Wage Earners and Self-Employed Individuals",
    description: "Financial disclosure for individual taxpayers seeking installment agreements or offers in compromise.",
    estimatedMinutes: 45,
    version: "1.0",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        description: "Taxpayer and spouse identifying information.",
        irsInstructions: "Complete all fields. If married and filing jointly, include spouse information.",
        columns: 2,
        fields: [
          { id: "tp_name", label: "Taxpayer Name", type: "text", required: true, placeholder: "Full legal name", irsRef: "Line 1a" },
          { id: "tp_ssn", label: "Social Security Number", type: "ssn", required: true, irsRef: "Line 1b" },
          { id: "tp_dob", label: "Date of Birth", type: "date", required: true, irsRef: "Line 1c" },
          { id: "tp_phone", label: "Home Phone", type: "phone", irsRef: "Line 1d" },
          { id: "tp_address", label: "Street Address", type: "text", required: true, colSpan: 2, irsRef: "Line 2a" },
          { id: "tp_city", label: "City", type: "text", required: true },
          { id: "tp_state", label: "State", type: "single_select", required: true, options: [
            { label: "Alabama", value: "AL" }, { label: "Alaska", value: "AK" }, { label: "Arizona", value: "AZ" },
            { label: "California", value: "CA" }, { label: "Colorado", value: "CO" }, { label: "Connecticut", value: "CT" },
            { label: "Florida", value: "FL" }, { label: "Georgia", value: "GA" }, { label: "Illinois", value: "IL" },
            { label: "New York", value: "NY" }, { label: "Texas", value: "TX" }, { label: "Washington", value: "WA" },
          ] },
          { id: "tp_zip", label: "ZIP Code", type: "text", required: true, validations: [{ type: "pattern", value: "^\\d{5}(-\\d{4})?$", message: "Enter a valid ZIP code" }] },
          { id: "marital_status", label: "Marital Status", type: "single_select", required: true, irsRef: "Line 4", options: [
            { label: "Single", value: "SINGLE" }, { label: "Married", value: "MARRIED" },
            { label: "Divorced", value: "DIVORCED" }, { label: "Widowed", value: "WIDOWED" },
            { label: "Separated", value: "SEPARATED" },
          ] },
          { id: "sp_name", label: "Spouse Name", type: "text", irsRef: "Line 5a", conditions: [{ fieldId: "marital_status", operator: "eq", value: "MARRIED" }] },
          { id: "sp_ssn", label: "Spouse SSN", type: "ssn", irsRef: "Line 5b", conditions: [{ fieldId: "marital_status", operator: "eq", value: "MARRIED" }] },
        ],
      },
      {
        id: "employment",
        title: "Employment Information",
        description: "Current employment and self-employment details.",
        columns: 2,
        fields: [
          { id: "is_employed", label: "Currently Employed?", type: "yes_no", required: true, irsRef: "Line 6" },
          { id: "employer_name", label: "Employer Name", type: "text", irsRef: "Line 7a", conditions: [{ fieldId: "is_employed", operator: "eq", value: "yes" }] },
          { id: "employer_address", label: "Employer Address", type: "text", colSpan: 2, irsRef: "Line 7b", conditions: [{ fieldId: "is_employed", operator: "eq", value: "yes" }] },
          { id: "occupation", label: "Occupation", type: "text", irsRef: "Line 7c", conditions: [{ fieldId: "is_employed", operator: "eq", value: "yes" }] },
          { id: "employed_since", label: "Employed Since", type: "date", irsRef: "Line 7d", conditions: [{ fieldId: "is_employed", operator: "eq", value: "yes" }] },
          { id: "is_self_employed", label: "Self-Employed?", type: "yes_no", required: true, irsRef: "Line 8" },
          { id: "business_name", label: "Business Name", type: "text", irsRef: "Line 9a", conditions: [{ fieldId: "is_self_employed", operator: "eq", value: "yes" }] },
          { id: "business_ein", label: "Business EIN", type: "ein", irsRef: "Line 9b", conditions: [{ fieldId: "is_self_employed", operator: "eq", value: "yes" }] },
        ],
      },
      {
        id: "income",
        title: "Income",
        description: "Monthly household income from all sources.",
        irsInstructions: "Enter gross monthly amounts. Include income for taxpayer and spouse.",
        columns: 2,
        fields: [
          { id: "wages_tp", label: "Wages (Taxpayer)", type: "currency", required: true, irsRef: "Line 19a", helpText: "Gross monthly wages before deductions" },
          { id: "wages_sp", label: "Wages (Spouse)", type: "currency", irsRef: "Line 19b", conditions: [{ fieldId: "marital_status", operator: "eq", value: "MARRIED" }] },
          { id: "se_income", label: "Self-Employment Income", type: "currency", irsRef: "Line 20", conditions: [{ fieldId: "is_self_employed", operator: "eq", value: "yes" }] },
          { id: "social_security", label: "Social Security", type: "currency", irsRef: "Line 21" },
          { id: "pension_income", label: "Pension / Retirement", type: "currency", irsRef: "Line 22" },
          { id: "rental_income", label: "Rental Income", type: "currency", irsRef: "Line 23" },
          { id: "interest_dividends", label: "Interest & Dividends", type: "currency", irsRef: "Line 24" },
          { id: "other_income", label: "Other Income", type: "currency", irsRef: "Line 25", helpText: "Alimony, child support, etc." },
          { id: "total_income", label: "Total Monthly Income", type: "computed", formula: "wages_tp + wages_sp + se_income + social_security + pension_income + rental_income + interest_dividends + other_income", irsRef: "Line 26" },
        ],
      },
      {
        id: "expenses",
        title: "Living Expenses",
        description: "Monthly necessary living expenses.",
        irsInstructions: "Enter actual monthly expenses. IRS allowable standards may differ.",
        columns: 2,
        fields: [
          { id: "food_clothing", label: "Food, Clothing & Misc.", type: "currency", required: true, irsRef: "Line 27" },
          { id: "housing_utilities", label: "Housing & Utilities", type: "currency", required: true, irsRef: "Line 28" },
          { id: "vehicle_payment", label: "Vehicle Payment(s)", type: "currency", irsRef: "Line 29" },
          { id: "vehicle_operating", label: "Vehicle Operating Costs", type: "currency", irsRef: "Line 30" },
          { id: "public_transport", label: "Public Transportation", type: "currency", irsRef: "Line 31" },
          { id: "health_insurance", label: "Health Insurance", type: "currency", irsRef: "Line 32" },
          { id: "out_of_pocket_medical", label: "Out-of-Pocket Medical", type: "currency", irsRef: "Line 33" },
          { id: "court_ordered", label: "Court-Ordered Payments", type: "currency", irsRef: "Line 34" },
          { id: "child_care", label: "Child/Dependent Care", type: "currency", irsRef: "Line 35" },
          { id: "life_insurance", label: "Life Insurance", type: "currency", irsRef: "Line 36" },
          { id: "taxes_current", label: "Current Tax Payments", type: "currency", irsRef: "Line 37", helpText: "Estimated tax, withholding, etc." },
          { id: "other_expenses", label: "Other Expenses", type: "currency", irsRef: "Line 38" },
          { id: "total_expenses", label: "Total Monthly Expenses", type: "computed", formula: "food_clothing + housing_utilities + vehicle_payment + vehicle_operating + public_transport + health_insurance + out_of_pocket_medical + court_ordered + child_care + life_insurance + taxes_current + other_expenses", irsRef: "Line 39" },
          { id: "remaining_income", label: "Remaining Income", type: "computed", formula: "total_income - total_expenses", irsRef: "Line 40", helpText: "Total Income minus Total Expenses" },
        ],
      },
      {
        id: "assets",
        title: "Assets",
        description: "Real property, vehicles, bank accounts, and other assets.",
        columns: 2,
        fields: [
          { id: "checking_balance", label: "Checking Account Balance", type: "currency", irsRef: "Line 13a" },
          { id: "savings_balance", label: "Savings Account Balance", type: "currency", irsRef: "Line 13b" },
          { id: "investment_balance", label: "Investment Accounts", type: "currency", irsRef: "Line 14", helpText: "Stocks, bonds, mutual funds" },
          { id: "retirement_balance", label: "Retirement Accounts", type: "currency", irsRef: "Line 15", helpText: "401k, IRA, pension value" },
          { id: "cash_value_life", label: "Cash Value Life Insurance", type: "currency", irsRef: "Line 16" },
          { id: "real_property", label: "Real Property (Equity)", type: "currency", irsRef: "Line 17", helpText: "Fair market value minus mortgage balance" },
          { id: "vehicles_value", label: "Vehicle Equity", type: "currency", irsRef: "Line 18", helpText: "Fair market value minus loan balance" },
          { id: "other_assets", label: "Other Assets", type: "currency", irsRef: "Line 19", helpText: "Art, collectibles, jewelry, etc." },
          { id: "total_assets", label: "Total Assets", type: "computed", formula: "checking_balance + savings_balance + investment_balance + retirement_balance + cash_value_life + real_property + vehicles_value + other_assets" },
        ],
      },
      {
        id: "additional",
        title: "Additional Information",
        description: "Supplemental details and attachments.",
        columns: 1,
        fields: [
          { id: "has_filed_all", label: "Have all required tax returns been filed?", type: "yes_no", required: true },
          { id: "unfiled_years", label: "List unfiled tax years", type: "text", conditions: [{ fieldId: "has_filed_all", operator: "eq", value: "no" }], helpText: "Comma-separated tax years (e.g., 2020, 2021)" },
          { id: "has_bankruptcy", label: "Filed for bankruptcy in the last 7 years?", type: "yes_no" },
          { id: "additional_notes", label: "Additional Notes", type: "textarea", placeholder: "Any additional information relevant to this case...", helpText: "Include explanations for unusual circumstances or hardship factors." },
          { id: "supporting_docs", label: "Supporting Documents", type: "file_upload", helpText: "Upload pay stubs, bank statements, or other supporting documentation.", acceptedFileTypes: [".pdf", ".jpg", ".png", ".docx"], maxFileSize: 10485760 },
        ],
      },
    ],
  },
  {
    id: "433-b",
    formNumber: "433-B",
    title: "Collection Information Statement for Businesses",
    description: "Financial disclosure for business entities seeking resolution of tax liabilities.",
    estimatedMinutes: 60,
    version: "1.0",
    sections: [
      {
        id: "business-info",
        title: "Business Information",
        description: "Business identifying information and structure.",
        columns: 2,
        fields: [
          { id: "biz_name", label: "Business Name", type: "text", required: true, irsRef: "Line 1a" },
          { id: "biz_ein", label: "Employer Identification Number", type: "ein", required: true, irsRef: "Line 1b" },
          { id: "biz_address", label: "Business Address", type: "text", required: true, colSpan: 2, irsRef: "Line 2" },
          { id: "biz_type", label: "Type of Business", type: "single_select", required: true, irsRef: "Line 3", options: [
            { label: "Sole Proprietorship", value: "SOLE_PROP" },
            { label: "Partnership", value: "PARTNERSHIP" },
            { label: "LLC", value: "LLC" },
            { label: "S Corporation", value: "S_CORP" },
            { label: "C Corporation", value: "C_CORP" },
          ] },
          { id: "biz_phone", label: "Business Phone", type: "phone", irsRef: "Line 4" },
          { id: "biz_website", label: "Website", type: "text", irsRef: "Line 5" },
        ],
      },
    ],
  },
  {
    id: "656",
    formNumber: "656",
    title: "Offer in Compromise",
    description: "Application for settling tax debt for less than the full amount owed.",
    estimatedMinutes: 30,
    version: "1.0",
    sections: [
      {
        id: "taxpayer-info",
        title: "Taxpayer Information",
        columns: 2,
        fields: [
          { id: "tp_name", label: "Taxpayer Name", type: "text", required: true },
          { id: "tp_ssn", label: "SSN / EIN", type: "ssn", required: true },
          { id: "offer_amount", label: "Offer Amount", type: "currency", required: true, helpText: "The amount you are offering to pay" },
          { id: "payment_option", label: "Payment Option", type: "single_select", required: true, options: [
            { label: "Lump Sum Cash", value: "LUMP_SUM" },
            { label: "Periodic Payment", value: "PERIODIC" },
          ] },
        ],
      },
    ],
  },
]

/** Look up a template by ID */
export function getFormTemplate(templateId: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((t) => t.id === templateId)
}
