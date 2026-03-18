/**
 * OIC Working Papers Template
 *
 * Defines the complete 7-tab structure per PRODUCT-SPEC.md section 5.1.
 * The template is static — all field labels, formulas, and layout are defined here.
 * The AI's only job is data extraction; this template handles structure.
 */

export interface TemplateField {
  key: string          // Maps to extraction schema key
  label: string        // Display label in spreadsheet
  type: "text" | "currency" | "number" | "date" | "percent" | "boolean" | "formula"
  formula?: string     // Reference to computation function
  flag?: string        // Default flag if data typically needs review
  required?: boolean
}

export interface TemplateSection {
  title: string
  fields: TemplateField[]
}

export interface TemplateTab {
  name: string
  sections: TemplateSection[]
}

export interface WorkingPaperTemplate {
  id: string
  name: string
  version: string
  caseType: string
  tabs: TemplateTab[]
}

export const OIC_TEMPLATE: WorkingPaperTemplate = {
  id: "oic-working-papers-v1",
  name: "Offer in Compromise Working Papers",
  version: "1.0",
  caseType: "OIC",
  tabs: [
    // Tab 1: Summary
    {
      name: "Summary",
      sections: [
        {
          title: "Offer Calculation",
          fields: [
            { key: "total_tax_liability", label: "Total Tax Liability", type: "currency" },
            { key: "total_personal_asset_equity", label: "Net Personal Asset Equity", type: "formula", formula: "SUM_PERSONAL_ASSETS" },
            { key: "total_business_asset_equity", label: "Net Business Asset Equity", type: "formula", formula: "SUM_BUSINESS_ASSETS" },
            { key: "total_asset_equity", label: "Total Asset Equity", type: "formula", formula: "TOTAL_ASSETS" },
            { key: "monthly_net_income", label: "Monthly Net Remaining Income", type: "formula", formula: "NET_INCOME" },
            { key: "future_income_lump", label: "Future Income (Lump Sum - 12 months)", type: "formula", formula: "FUTURE_INCOME_12" },
            { key: "future_income_periodic", label: "Future Income (Periodic - 24 months)", type: "formula", formula: "FUTURE_INCOME_24" },
            { key: "rcp_lump", label: "RCP - Lump Sum Offer", type: "formula", formula: "RCP_LUMP" },
            { key: "rcp_periodic", label: "RCP - Periodic Payment Offer", type: "formula", formula: "RCP_PERIODIC" },
            { key: "recommended_offer_type", label: "Recommended Offer Type", type: "text", flag: "PRACTITIONER_JUDGMENT" },
            { key: "recommended_offer_amount", label: "Recommended Offer Amount", type: "currency", flag: "PRACTITIONER_JUDGMENT" },
          ],
        },
      ],
    },

    // Tab 2: TP Info
    {
      name: "TP Info",
      sections: [
        {
          title: "Taxpayer Information",
          fields: [
            { key: "taxpayer1_name", label: "Taxpayer 1 Name", type: "text", required: true },
            { key: "taxpayer2_name", label: "Taxpayer 2 Name (if MFJ)", type: "text" },
            { key: "filing_status", label: "Filing Status", type: "text", required: true },
            { key: "address", label: "Address", type: "text" },
            { key: "county", label: "County", type: "text" },
          ],
        },
        {
          title: "Dependents",
          fields: [
            { key: "dependents", label: "Dependents (name, age, relationship, income)", type: "text" },
          ],
        },
        {
          title: "Employment",
          fields: [
            { key: "tp1_employer", label: "TP1 Employer", type: "text" },
            { key: "tp1_occupation", label: "TP1 Occupation", type: "text" },
            { key: "tp1_employment_length", label: "TP1 How Long Employed", type: "text" },
            { key: "tp2_employer", label: "TP2 Employer", type: "text" },
            { key: "tp2_occupation", label: "TP2 Occupation", type: "text" },
            { key: "tp2_employment_length", label: "TP2 How Long Employed", type: "text" },
          ],
        },
        {
          title: "Self-Employment",
          fields: [
            { key: "self_employed", label: "Self-Employed?", type: "boolean" },
            { key: "business_name", label: "Business Name", type: "text" },
            { key: "business_ein", label: "Business EIN", type: "text" },
            { key: "business_address", label: "Business Address", type: "text" },
            { key: "business_type", label: "Business Entity Type", type: "text" },
            { key: "num_employees", label: "Number of Employees", type: "number" },
            { key: "avg_monthly_payroll", label: "Average Monthly Payroll", type: "currency" },
          ],
        },
        {
          title: "433-A Questionnaire",
          fields: [
            { key: "q_lawsuits_pending", label: "Any lawsuits pending?", type: "text" },
            { key: "q_bankruptcy_filed", label: "Filed bankruptcy in last 10 years?", type: "text" },
            { key: "q_irs_litigation", label: "Involved in any IRS litigation?", type: "text" },
            { key: "q_trust_beneficiary", label: "Beneficiary of a trust or estate?", type: "text" },
            { key: "q_life_insurance", label: "Life insurance policies?", type: "text" },
            { key: "q_safe_deposit_box", label: "Safe deposit box?", type: "text" },
            { key: "q_asset_transfers", label: "Asset transfers in last 10 years?", type: "text", flag: "PRACTITIONER_JUDGMENT" },
          ],
        },
      ],
    },

    // Tab 3: Income & Expenses — Personal
    {
      name: "Income & Expenses - Personal",
      sections: [
        {
          title: "Monthly Income",
          fields: [
            { key: "wages_tp1", label: "Wages/Salary - TP1", type: "currency" },
            { key: "wages_tp2", label: "Wages/Salary - TP2", type: "currency" },
            { key: "social_security", label: "Social Security", type: "currency" },
            { key: "pension_income", label: "Pensions", type: "currency" },
            { key: "interest_income", label: "Interest Income", type: "currency" },
            { key: "dividend_income", label: "Dividend Income", type: "currency" },
            { key: "rental_income_net", label: "Net Rental Income", type: "currency" },
            { key: "distribution_income", label: "Distributions from Business", type: "currency" },
            { key: "child_support_received", label: "Child Support Received", type: "currency" },
            { key: "alimony_received", label: "Alimony Received", type: "currency" },
            { key: "other_income", label: "Other Income", type: "currency" },
            { key: "total_monthly_income", label: "Total Monthly Income", type: "formula", formula: "SUM_INCOME" },
          ],
        },
        {
          title: "Monthly Expenses (IRS Collection Financial Standards)",
          fields: [
            { key: "expense_food_clothing", label: "Food, Clothing & Misc (National Standard)", type: "currency" },
            { key: "expense_housing_utilities", label: "Housing & Utilities (Local Standard)", type: "currency" },
            { key: "expense_vehicle_payment_1", label: "Vehicle Payment 1", type: "currency" },
            { key: "expense_vehicle_payment_2", label: "Vehicle Payment 2", type: "currency" },
            { key: "expense_vehicle_operating", label: "Vehicle Operating Costs (Local Standard)", type: "currency" },
            { key: "expense_public_transportation", label: "Public Transportation", type: "currency" },
            { key: "expense_health_insurance", label: "Health Insurance", type: "currency" },
            { key: "expense_health_oop", label: "Out-of-Pocket Health Costs", type: "currency" },
            { key: "expense_court_ordered", label: "Court-Ordered Payments", type: "currency" },
            { key: "expense_child_care", label: "Child/Dependent Care", type: "currency" },
            { key: "expense_life_insurance", label: "Term Life Insurance", type: "currency" },
            { key: "expense_current_taxes", label: "Current Year Taxes", type: "currency" },
            { key: "expense_secured_debts", label: "Secured Debts (student loans, etc.)", type: "currency" },
            { key: "expense_other", label: "Other Necessary Expenses", type: "currency", flag: "PRACTITIONER_JUDGMENT" },
            { key: "expense_other_description", label: "Other Expenses Description", type: "text" },
            { key: "total_monthly_expenses", label: "Total Monthly Expenses", type: "formula", formula: "SUM_EXPENSES" },
            { key: "net_monthly_remaining", label: "Net Monthly Remaining Income", type: "formula", formula: "NET_INCOME" },
          ],
        },
      ],
    },

    // Tab 4: Assets & Debts — Personal
    {
      name: "Assets & Debts - Personal",
      sections: [
        {
          title: "Cash & Bank Accounts",
          fields: [
            { key: "cash_on_hand", label: "Cash on Hand", type: "currency" },
            { key: "bank_accounts", label: "Bank Accounts (institution, type, balance)", type: "text", flag: "VERIFY" },
            { key: "total_bank_balances", label: "Total Bank Account Balances", type: "currency" },
          ],
        },
        {
          title: "Investments & Retirement",
          fields: [
            { key: "retirement_accounts", label: "Retirement Accounts (type, custodian, balance)", type: "text" },
            { key: "total_retirement_balance", label: "Total Retirement Balances", type: "currency" },
            { key: "investment_accounts", label: "Other Investment Accounts", type: "currency" },
            { key: "life_insurance_cash_value", label: "Life Insurance Cash Value", type: "currency" },
            { key: "life_insurance_loan_balance", label: "Life Insurance Loan Balance", type: "currency" },
            { key: "life_insurance_net", label: "Life Insurance Net Value", type: "formula", formula: "LIFE_INS_NET" },
          ],
        },
        {
          title: "Real Estate",
          fields: [
            { key: "real_estate", label: "Real Estate Details", type: "text" },
            { key: "real_estate_fmv", label: "Real Estate FMV", type: "currency", flag: "VERIFY" },
            { key: "real_estate_qsv_reduction", label: "Quick Sale Value Reduction (20%)", type: "formula", formula: "QSV_RE" },
            { key: "real_estate_loan_balance", label: "Mortgage/Loan Balance", type: "currency", flag: "VERIFY" },
            { key: "real_estate_net_equity", label: "Net Real Estate Equity", type: "formula", formula: "NET_RE_EQUITY" },
          ],
        },
        {
          title: "Vehicles",
          fields: [
            { key: "vehicles", label: "Vehicle Details (year/make/model, mileage)", type: "text" },
            { key: "vehicles_fmv", label: "Vehicles Total FMV", type: "currency", flag: "VERIFY" },
            { key: "vehicles_qsv_reduction", label: "Quick Sale Value Reduction (20%)", type: "formula", formula: "QSV_VEH" },
            { key: "vehicles_loan_balance", label: "Vehicle Loan Balances", type: "currency", flag: "VERIFY" },
            { key: "vehicles_net_equity", label: "Net Vehicle Equity", type: "formula", formula: "NET_VEH_EQUITY" },
          ],
        },
        {
          title: "Other Personal Assets",
          fields: [
            { key: "digital_assets", label: "Digital Assets (crypto, etc.)", type: "currency" },
            { key: "safe_deposit_contents", label: "Safe Deposit Box Contents", type: "text" },
            { key: "other_personal_assets", label: "Other Assets", type: "currency" },
            { key: "other_assets_description", label: "Other Assets Description", type: "text" },
            { key: "total_personal_asset_equity", label: "Total Net Personal Asset Equity", type: "formula", formula: "SUM_PERSONAL_ASSETS" },
          ],
        },
      ],
    },

    // Tab 5: Business Information
    {
      name: "Business Information",
      sections: [
        {
          title: "Business Details",
          fields: [
            { key: "biz_name", label: "Business Name", type: "text" },
            { key: "biz_ein", label: "EIN", type: "text" },
            { key: "biz_entity_type", label: "Entity Type", type: "text" },
            { key: "biz_return_type", label: "Return Type Filed", type: "text" },
            { key: "biz_address", label: "Business Address", type: "text" },
            { key: "biz_start_date", label: "Date Started", type: "text" },
            { key: "biz_officers", label: "Officers/Partners/Members", type: "text" },
          ],
        },
        {
          title: "Business Receivables",
          fields: [
            { key: "biz_accounts_receivable", label: "Accounts Receivable", type: "currency" },
            { key: "biz_notes_receivable", label: "Notes Receivable", type: "currency" },
          ],
        },
        {
          title: "433-B Questionnaire",
          fields: [
            { key: "biz_q_bankruptcy", label: "Business filed bankruptcy?", type: "text" },
            { key: "biz_q_affiliations", label: "Related businesses/affiliations?", type: "text" },
            { key: "biz_q_related_party_debts", label: "Debts owed to related parties?", type: "text" },
            { key: "biz_q_litigation", label: "Pending litigation?", type: "text" },
            { key: "biz_q_asset_transfers", label: "Asset transfers in last 10 years?", type: "text", flag: "PRACTITIONER_JUDGMENT" },
            { key: "biz_q_foreign_operations", label: "Foreign operations or accounts?", type: "text" },
            { key: "biz_q_third_party_funds", label: "Third-party funds held?", type: "text" },
            { key: "biz_q_lines_of_credit", label: "Lines of credit available?", type: "text" },
          ],
        },
      ],
    },

    // Tab 6: Income & Expenses — Business
    {
      name: "Income & Expenses - Business",
      sections: [
        {
          title: "Monthly Business Income",
          fields: [
            { key: "biz_gross_receipts", label: "Gross Receipts/Sales", type: "currency" },
            { key: "biz_rental_income", label: "Rental Income", type: "currency" },
            { key: "biz_interest_income", label: "Interest Income", type: "currency" },
            { key: "biz_dividend_income", label: "Dividend Income", type: "currency" },
            { key: "biz_other_income", label: "Other Business Income", type: "currency" },
            { key: "biz_total_income", label: "Total Business Income", type: "formula", formula: "SUM_BIZ_INCOME" },
          ],
        },
        {
          title: "Monthly Business Expenses",
          fields: [
            { key: "biz_expense_materials", label: "Materials/Inventory", type: "currency" },
            { key: "biz_expense_wages", label: "Wages/Salaries", type: "currency" },
            { key: "biz_expense_rent", label: "Rent", type: "currency" },
            { key: "biz_expense_supplies", label: "Supplies", type: "currency" },
            { key: "biz_expense_utilities", label: "Utilities/Telephone", type: "currency" },
            { key: "biz_expense_vehicle", label: "Vehicle Costs", type: "currency" },
            { key: "biz_expense_insurance", label: "Insurance", type: "currency" },
            { key: "biz_expense_taxes", label: "Current Taxes", type: "currency" },
            { key: "biz_expense_other", label: "Other Expenses", type: "currency" },
            { key: "biz_expense_other_detail", label: "Other Expenses Detail", type: "text" },
            { key: "biz_total_expenses", label: "Total Business Expenses", type: "formula", formula: "SUM_BIZ_EXPENSES" },
            { key: "biz_net_income", label: "Net Business Income", type: "formula", formula: "NET_BIZ_INCOME" },
          ],
        },
      ],
    },

    // Tab 7: Assets & Debts — Business
    {
      name: "Assets & Debts - Business",
      sections: [
        {
          title: "Business Cash & Accounts",
          fields: [
            { key: "biz_cash_on_hand", label: "Cash on Hand", type: "currency" },
            { key: "biz_bank_accounts", label: "Business Bank Accounts (institution, balance)", type: "text" },
            { key: "biz_total_bank_balances", label: "Total Bank Balances", type: "currency" },
            { key: "biz_accounts_receivable_total", label: "Accounts Receivable", type: "currency" },
          ],
        },
        {
          title: "Business Equipment & Vehicles",
          fields: [
            { key: "biz_equipment", label: "Equipment Details", type: "text" },
            { key: "biz_equipment_fmv", label: "Equipment FMV", type: "currency", flag: "VERIFY" },
            { key: "biz_equipment_qsv_reduction", label: "QSV Reduction (20%)", type: "formula", formula: "QSV_EQUIP" },
            { key: "biz_equipment_loan_balance", label: "Equipment Loan Balance", type: "currency" },
            { key: "biz_equipment_net_equity", label: "Net Equipment Equity", type: "formula", formula: "NET_EQUIP" },
            { key: "biz_vehicles", label: "Business Vehicle Details", type: "text" },
            { key: "biz_vehicles_fmv", label: "Business Vehicles FMV", type: "currency", flag: "VERIFY" },
            { key: "biz_vehicles_qsv_reduction", label: "QSV Reduction (20%)", type: "formula", formula: "QSV_BIZ_VEH" },
            { key: "biz_vehicles_loan_balance", label: "Vehicle Loan Balance", type: "currency" },
            { key: "biz_vehicles_net_equity", label: "Net Vehicle Equity", type: "formula", formula: "NET_BIZ_VEH" },
          ],
        },
        {
          title: "Business Real Estate",
          fields: [
            { key: "biz_real_estate", label: "Business Real Estate Details", type: "text" },
            { key: "biz_real_estate_fmv", label: "FMV", type: "currency", flag: "VERIFY" },
            { key: "biz_real_estate_qsv", label: "QSV Reduction (20%)", type: "formula", formula: "QSV_BIZ_RE" },
            { key: "biz_real_estate_loan", label: "Loan Balance", type: "currency" },
            { key: "biz_real_estate_net", label: "Net Equity", type: "formula", formula: "NET_BIZ_RE" },
          ],
        },
        {
          title: "Other Business Assets",
          fields: [
            { key: "biz_intangibles", label: "Intangible Assets / Goodwill", type: "currency", flag: "PRACTITIONER_JUDGMENT" },
            { key: "biz_lines_of_credit", label: "Available Lines of Credit", type: "currency" },
            { key: "biz_other_assets", label: "Other Business Assets", type: "currency" },
            { key: "biz_other_assets_description", label: "Description", type: "text" },
            { key: "total_business_asset_equity", label: "Total Net Business Asset Equity", type: "formula", formula: "SUM_BUSINESS_ASSETS" },
          ],
        },
      ],
    },
  ],
}

/**
 * Get all extraction keys from the template (non-formula fields only).
 * These are the keys the AI needs to extract from documents.
 */
export function getExtractionKeys(template: WorkingPaperTemplate): string[] {
  const keys: string[] = []
  for (const tab of template.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (field.type !== "formula") {
          keys.push(field.key)
        }
      }
    }
  }
  return keys
}
