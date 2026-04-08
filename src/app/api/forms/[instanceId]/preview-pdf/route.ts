import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { getFormInstance } from "@/lib/forms/form-store"
import { getAcroFieldMap } from "@/lib/forms/pdf-maps/registry"
import { getAutoMapping, getPDFFileName } from "@/lib/forms/pdf-auto-mapper"

const FORM_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM 433-A  (Rev. 7-2022) — Collection Information Statement
// Full AcroForm field mapping: our schema field ID → IRS PDF field name
// All field names are prefixed with topmostSubform[0].PageN[0].
// ─────────────────────────────────────────────────────────────────────────────

const P1 = "topmostSubform[0].Page1[0]"
const P2 = "topmostSubform[0].Page2[0]"
const P3 = "topmostSubform[0].Page3[0]"
const P4 = "topmostSubform[0].Page4[0]"
const P5 = "topmostSubform[0].Page5[0]"
const P6 = "topmostSubform[0].Page6[0]"

const FORM_433A_FIELD_MAP: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Personal Information (107 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Line 1a: Full Name ---
  "taxpayer_name": `${P1}.c1[0].Lines1a-b[0].p1-t4[0]`,
  // --- Line 1b: Address (street, city, state, ZIP) ---
  "address_street": `${P1}.c1[0].Lines1a-b[0].p1-t5[0]`,
  // --- Line 1c: County of Residence ---
  "county": `${P1}.c1[0].Line1c[0].p1-t6c[0]`,
  // --- Line 1d: Home Phone ---
  "home_phone": `${P1}.c1[0].Line1c[0].p1-t7c[0]`,
  // --- Line 1e: Cell Phone ---
  "cell_phone": `${P1}.c1[0].Line1d[0].p1-t8d[0]`,
  // --- Line 1e: Cell Phone alternate ---
  "cell_phone_alt": `${P1}.c1[0].Line1d[0].p1-t9d[0]`,
  // --- Line 1f: Work Phone ---
  "work_phone": `${P1}.c1[0].Line1e[0].p1-t10e[0]`,
  // --- Line 1f: Work Phone alternate ---
  "work_phone_alt": `${P1}.c1[0].Line1e[0].p1-t11e[0]`,

  // --- Line 2a: Marital Status checkboxes ---
  "marital_status": `${P1}.c1[0].C1_01_2a[0]`,
  "marital_status_2": `${P1}.c1[0].C1_01_2a[1]`,

  // --- Line 2b: SSN/DOB Table (Part 4, Line 5 structure) ---
  // Taxpayer row
  "ssn": `${P1}.c1[0].Table_Part4-Line5[0].Row1[0].F02_030_0_[0]`,
  "dob": `${P1}.c1[0].Table_Part4-Line5[0].Row1[0].F02_031_0_[0]`,
  // Spouse row
  "spouse_ssn": `${P1}.c1[0].Table_Part4-Line5[0].Row2[0].F02_034_0_[0]`,
  "spouse_dob": `${P1}.c1[0].Table_Part4-Line5[0].Row2[0].F02_035_0_[0]`,

  // --- Spouse Name (second instance of Lines1a-b) ---
  "spouse_name": `${P1}.c1[0].Lines1a-b[1].p1-t4[0]`,

  // --- Dependents Table (Line 6) ---
  // Row 1
  "dependents.0.dep_name": `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Name[0]`,
  "dependents.0.dep_age": `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Age[0]`,
  "dependents.0.dep_relationship": `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Relationship[0]`,
  // Row 2
  "dependents.1.dep_name": `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Name[0]`,
  "dependents.1.dep_age": `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Age[0]`,
  "dependents.1.dep_relationship": `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Relationship[0]`,
  // Row 3
  "dependents.2.dep_name": `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Name[0]`,
  "dependents.2.dep_age": `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Age[0]`,
  "dependents.2.dep_relationship": `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Relationship[0]`,
  // Row 4
  "dependents.3.dep_name": `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Name[0]`,
  "dependents.3.dep_age": `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Age[0]`,
  "dependents.3.dep_relationship": `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Relationship[0]`,

  // --- Line 3a-3c: Outside Business Interests ---
  "outside_business_interests": `${P1}.c2[0].Line3a[0].p1-cb3a[0]`,
  "other_business_interests.0.obi_business_name": `${P1}.c2[0].Line3a[0].p1-t12_3a[0]`,
  "other_business_interests.0.obi_ownership_percentage": `${P1}.c2[0].Line3a[0].p1-t13_3a[0]`,
  "other_business_interests.0.obi_title": `${P1}.c2[0].Line3a[0].p1-t14_3a[0]`,
  "other_business_interests.0.obi_entity_type": `${P1}.c2[0].Line3a[0].p1-t15_3a[0]`,
  "other_business_interests.1.obi_business_name": `${P1}.c2[0].Line3b[0].p1-t16_3b[0]`,
  "other_business_interests.1.obi_ownership_percentage": `${P1}.c2[0].Line3b[0].p1-t17_3b[0]`,
  "other_business_interests.1.obi_title": `${P1}.c2[0].Line3b[0].p1-t18_3b[0]`,
  "other_business_interests.1.obi_entity_type": `${P1}.c2[0].Line3b[0].p1-t19_3b[0]`,

  // --- Line 4: Yes/No Questions (Part 1, Page 1) ---
  "filed_bankruptcy": `${P1}.c2[0].Line4[0].p1-cb4[0]`,
  "involved_lawsuit": `${P1}.c2[0].Line5[0].p1-cb5[0]`,
  "transferred_assets": `${P1}.c2[0].Line6[0].p1-cb6[0]`,
  "anticipated_income_change": `${P1}.c2[0].Line7[0].p1-cb7[0]`,
  "trust_interest": `${P1}.c2[0].Line8[0].p1-cb8[0]`,
  "lived_outside_us": `${P1}.c2[0].Line9[0].p1-cb9[0]`,

  // --- Yes/No detail text fields ---
  "bankruptcy_date": `${P1}.c2[0].Line4[0].p1-t20_4[0]`,
  "lawsuit_details": `${P1}.c2[0].Line5[0].p1-t21_5[0]`,
  "transfer_details": `${P1}.c2[0].Line6[0].p1-t22_6[0]`,
  "income_change_details": `${P1}.c2[0].Line7[0].p1-t23_7[0]`,
  "trust_details": `${P1}.c2[0].Line8[0].p1-t24_8[0]`,
  "outside_us_details": `${P1}.c2[0].Line9[0].p1-t25_9[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: Employment & Self-Employment (67 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 3: Employment Information ---
  // --- Line 10: Employment Type ---
  "employment_type": `${P2}.Line10[0].p2-cb10[0]`,

  // --- Lines 11-12: Employer Table (Table_Line13) ---
  // Employer 1 (Line 12a)
  "employers.0.emp_name": `${P2}.Table_Line13[0].Line12a[0].p2-t1_12a[0]`,
  "employers.0.emp_address": `${P2}.Table_Line13[0].Line12a[0].p2-t2_12a[0]`,
  "employers.0.emp_phone": `${P2}.Table_Line13[0].Line12a[0].p2-t3_12a[0]`,
  "employers.0.emp_ein": `${P2}.Table_Line13[0].Line12a[0].p2-t4_12a[0]`,
  "employers.0.emp_hire_date": `${P2}.Table_Line13[0].Line12a[0].p2-t5_12a[0]`,
  "employers.0.emp_gross_monthly": `${P2}.Table_Line13[0].Line12a[0].p2-t6_12a[0]`,
  "employers.0.emp_net_monthly": `${P2}.Table_Line13[0].Line12a[0].p2-t7_12a[0]`,
  "employers.0.emp_pay_frequency": `${P2}.Table_Line13[0].Line12a[0].p2-t8_12a[0]`,
  // Employer 2 (Line 12b)
  "employers.1.emp_name": `${P2}.Table_Line13[0].Line12b[0].p2-t1_12b[0]`,
  "employers.1.emp_address": `${P2}.Table_Line13[0].Line12b[0].p2-t2_12b[0]`,
  "employers.1.emp_phone": `${P2}.Table_Line13[0].Line12b[0].p2-t3_12b[0]`,
  "employers.1.emp_ein": `${P2}.Table_Line13[0].Line12b[0].p2-t4_12b[0]`,
  "employers.1.emp_hire_date": `${P2}.Table_Line13[0].Line12b[0].p2-t5_12b[0]`,
  "employers.1.emp_gross_monthly": `${P2}.Table_Line13[0].Line12b[0].p2-t6_12b[0]`,
  "employers.1.emp_net_monthly": `${P2}.Table_Line13[0].Line12b[0].p2-t7_12b[0]`,
  "employers.1.emp_pay_frequency": `${P2}.Table_Line13[0].Line12b[0].p2-t8_12b[0]`,

  // --- Line 13: Self-Employment / Business Info ---
  "business_name": `${P2}.Line13[0].p2-t9_13[0]`,
  "business_ein": `${P2}.Line13[0].p2-t10_13[0]`,
  "business_type": `${P2}.Line13[0].p2-t11_13[0]`,
  "business_gross_monthly": `${P2}.Line13[0].p2-t12_13[0]`,
  "business_expenses_monthly": `${P2}.Line13[0].p2-t13_13[0]`,
  "business_net_monthly": `${P2}.Line13[0].p2-t14_13[0]`,

  // --- Lines 14: Assets Table (Table_Line14) ---
  // Cash on hand (Line 12)
  "cash_on_hand": `${P2}.Table_Line14[0].Row12[0].p2-t15_12[0]`,

  // Bank accounts
  "bank_accounts.0.bank_name": `${P2}.Table_Line14[0].Row13a[0].p2-t16_13a[0]`,
  "bank_accounts.0.bank_account_type": `${P2}.Table_Line14[0].Row13a[0].p2-t17_13a[0]`,
  "bank_accounts.0.bank_balance": `${P2}.Table_Line14[0].Row13a[0].p2-t18_13a[0]`,
  "bank_accounts.1.bank_name": `${P2}.Table_Line14[0].Row13b[0].p2-t16_13b[0]`,
  "bank_accounts.1.bank_account_type": `${P2}.Table_Line14[0].Row13b[0].p2-t17_13b[0]`,
  "bank_accounts.1.bank_balance": `${P2}.Table_Line14[0].Row13b[0].p2-t18_13b[0]`,
  "bank_accounts.2.bank_name": `${P2}.Table_Line14[0].Row13c[0].p2-t16_13c[0]`,
  "bank_accounts.2.bank_account_type": `${P2}.Table_Line14[0].Row13c[0].p2-t17_13c[0]`,
  "bank_accounts.2.bank_balance": `${P2}.Table_Line14[0].Row13c[0].p2-t18_13c[0]`,

  // Investments (Lines 14a-14c)
  "investments.0.inv_institution": `${P2}.Table_Line14[0].Row14a[0].p2-t19_14a[0]`,
  "investments.0.inv_type": `${P2}.Table_Line14[0].Row14a[0].p2-t20_14a[0]`,
  "investments.0.inv_balance": `${P2}.Table_Line14[0].Row14a[0].p2-t21_14a[0]`,
  "investments.0.inv_loan": `${P2}.Table_Line14[0].Row14a[0].p2-t22_14a[0]`,
  "investments.1.inv_institution": `${P2}.Table_Line14[0].Row14b[0].p2-t19_14b[0]`,
  "investments.1.inv_type": `${P2}.Table_Line14[0].Row14b[0].p2-t20_14b[0]`,
  "investments.1.inv_balance": `${P2}.Table_Line14[0].Row14b[0].p2-t21_14b[0]`,
  "investments.1.inv_loan": `${P2}.Table_Line14[0].Row14b[0].p2-t22_14b[0]`,

  // Digital assets (Lines 14c-14e)
  "digital_assets": `${P2}.Table_Line14[0].Row14c[0].p2-cb14c[0]`,
  "digital_assets_detail.0.da_wallet_exchange": `${P2}.Table_Line14[0].Row14d[0].p2-t23_14d[0]`,
  "digital_assets_detail.0.da_asset_type": `${P2}.Table_Line14[0].Row14d[0].p2-t24_14d[0]`,
  "digital_assets_detail.0.da_estimated_value": `${P2}.Table_Line14[0].Row14d[0].p2-t25_14d[0]`,
  "digital_assets_detail.1.da_wallet_exchange": `${P2}.Table_Line14[0].Row14e[0].p2-t23_14e[0]`,
  "digital_assets_detail.1.da_asset_type": `${P2}.Table_Line14[0].Row14e[0].p2-t24_14e[0]`,
  "digital_assets_detail.1.da_estimated_value": `${P2}.Table_Line14[0].Row14e[0].p2-t25_14e[0]`,

  // Available credit (Lines 15a-15c)
  "available_credit.0.cl_institution": `${P2}.Table_Line15[0].Row15a[0].p2-t26_15a[0]`,
  "available_credit.0.cl_credit_limit": `${P2}.Table_Line15[0].Row15a[0].p2-t27_15a[0]`,
  "available_credit.0.cl_amount_owed": `${P2}.Table_Line15[0].Row15a[0].p2-t28_15a[0]`,
  "available_credit.1.cl_institution": `${P2}.Table_Line15[0].Row15b[0].p2-t26_15b[0]`,
  "available_credit.1.cl_credit_limit": `${P2}.Table_Line15[0].Row15b[0].p2-t27_15b[0]`,
  "available_credit.1.cl_amount_owed": `${P2}.Table_Line15[0].Row15b[0].p2-t28_15b[0]`,

  // Credit cards
  "credit_cards.0.cc_institution": `${P2}.Table_Line15[0].Row15c[0].p2-t29_15c[0]`,
  "credit_cards.0.cc_credit_limit": `${P2}.Table_Line15[0].Row15c[0].p2-t30_15c[0]`,
  "credit_cards.0.cc_balance": `${P2}.Table_Line15[0].Row15c[0].p2-t31_15c[0]`,
  "credit_cards.0.cc_minimum_payment": `${P2}.Table_Line15[0].Row15c[0].p2-t32_15c[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: Real Property, Vehicles, Other Assets (69 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Line 16: Real Property ---
  // Real Property 1 (Table_Line17a)
  "real_property.0.prop_description": `${P3}.Table_Line17a[0].p3-t1_17a[0]`,
  "real_property.0.prop_address": `${P3}.Table_Line17a[0].p3-t2_17a[0]`,
  "real_property.0.prop_fmv": `${P3}.Table_Line17a[0].p3-t3_17a[0]`,
  "real_property.0.prop_loan": `${P3}.Table_Line17a[0].p3-t4_17a[0]`,
  "real_property.0.prop_equity": `${P3}.Table_Line17a[0].p3-t5_17a[0]`,
  "real_property.0.prop_monthly_payment": `${P3}.Table_Line17a[0].p3-t6_17a[0]`,
  "real_property.0.prop_lender": `${P3}.Table_Line17a[0].p3-t7_17a[0]`,
  // Real Property 2 (Table_Line17b)
  "real_property.1.prop_description": `${P3}.Table_Line17b[0].p3-t1_17b[0]`,
  "real_property.1.prop_address": `${P3}.Table_Line17b[0].p3-t2_17b[0]`,
  "real_property.1.prop_fmv": `${P3}.Table_Line17b[0].p3-t3_17b[0]`,
  "real_property.1.prop_loan": `${P3}.Table_Line17b[0].p3-t4_17b[0]`,
  "real_property.1.prop_equity": `${P3}.Table_Line17b[0].p3-t5_17b[0]`,
  "real_property.1.prop_monthly_payment": `${P3}.Table_Line17b[0].p3-t6_17b[0]`,
  "real_property.1.prop_lender": `${P3}.Table_Line17b[0].p3-t7_17b[0]`,

  // --- Line 17: Retirement Accounts ---
  "retirement_accounts.0.ret_institution": `${P3}.Table_Line17c[0].Row17c1[0].p3-t8_17c[0]`,
  "retirement_accounts.0.ret_type": `${P3}.Table_Line17c[0].Row17c1[0].p3-t9_17c[0]`,
  "retirement_accounts.0.ret_balance": `${P3}.Table_Line17c[0].Row17c1[0].p3-t10_17c[0]`,
  "retirement_accounts.0.ret_loan": `${P3}.Table_Line17c[0].Row17c1[0].p3-t11_17c[0]`,
  "retirement_accounts.1.ret_institution": `${P3}.Table_Line17c[0].Row17c2[0].p3-t8_17c2[0]`,
  "retirement_accounts.1.ret_type": `${P3}.Table_Line17c[0].Row17c2[0].p3-t9_17c2[0]`,
  "retirement_accounts.1.ret_balance": `${P3}.Table_Line17c[0].Row17c2[0].p3-t10_17c2[0]`,
  "retirement_accounts.1.ret_loan": `${P3}.Table_Line17c[0].Row17c2[0].p3-t11_17c2[0]`,

  // --- Line 18: Vehicles ---
  // Vehicle 1 (Line18a)
  "vehicles.0.veh_year": `${P3}.Line18a[0].p3-t12_18a[0]`,
  "vehicles.0.veh_make": `${P3}.Line18a[0].p3-t13_18a[0]`,
  "vehicles.0.veh_model": `${P3}.Line18a[0].p3-t14_18a[0]`,
  "vehicles.0.veh_mileage": `${P3}.Line18a[0].p3-t15_18a[0]`,
  "vehicles.0.veh_fmv": `${P3}.Line18a[0].p3-t16_18a[0]`,
  "vehicles.0.veh_loan": `${P3}.Line18a[0].p3-t17_18a[0]`,
  "vehicles.0.veh_equity": `${P3}.Line18a[0].p3-t18_18a[0]`,
  "vehicles.0.veh_monthly_payment": `${P3}.Line18a[0].p3-t19_18a[0]`,
  "vehicles.0.veh_lender": `${P3}.Line18a[0].p3-t20_18a[0]`,
  // Vehicle 2 (Line18b)
  "vehicles.1.veh_year": `${P3}.Line18b[0].p3-t12_18b[0]`,
  "vehicles.1.veh_make": `${P3}.Line18b[0].p3-t13_18b[0]`,
  "vehicles.1.veh_model": `${P3}.Line18b[0].p3-t14_18b[0]`,
  "vehicles.1.veh_mileage": `${P3}.Line18b[0].p3-t15_18b[0]`,
  "vehicles.1.veh_fmv": `${P3}.Line18b[0].p3-t16_18b[0]`,
  "vehicles.1.veh_loan": `${P3}.Line18b[0].p3-t17_18b[0]`,
  "vehicles.1.veh_equity": `${P3}.Line18b[0].p3-t18_18b[0]`,
  "vehicles.1.veh_monthly_payment": `${P3}.Line18b[0].p3-t19_18b[0]`,
  "vehicles.1.veh_lender": `${P3}.Line18b[0].p3-t20_18b[0]`,

  // --- Line 19: Life Insurance ---
  "life_insurance_csv": `${P3}.Line19[0].p3-t21_19[0]`,

  // --- Line 20: Other Assets ---
  "other_assets.0.other_description": `${P3}.Table_Line20[0].Row20a[0].p3-t22_20a[0]`,
  "other_assets.0.other_fmv": `${P3}.Table_Line20[0].Row20a[0].p3-t23_20a[0]`,
  "other_assets.0.other_loan": `${P3}.Table_Line20[0].Row20a[0].p3-t24_20a[0]`,
  "other_assets.1.other_description": `${P3}.Table_Line20[0].Row20b[0].p3-t22_20b[0]`,
  "other_assets.1.other_fmv": `${P3}.Table_Line20[0].Row20b[0].p3-t23_20b[0]`,
  "other_assets.1.other_loan": `${P3}.Table_Line20[0].Row20b[0].p3-t24_20b[0]`,
  "other_assets.2.other_description": `${P3}.Table_Line20[0].Row20c[0].p3-t22_20c[0]`,
  "other_assets.2.other_fmv": `${P3}.Table_Line20[0].Row20c[0].p3-t23_20c[0]`,
  "other_assets.2.other_loan": `${P3}.Table_Line20[0].Row20c[0].p3-t24_20c[0]`,

  // --- Line 21: Safe Deposit Box ---
  "has_safe_deposit": `${P3}.Line21[0].p3-cb21[0]`,
  "safe_deposit_location": `${P3}.Line21[0].p3-t25_21[0]`,
  "safe_deposit_contents": `${P3}.Line21[0].p3-t26_21[0]`,

  // Total bank balances
  "total_bank_balances": `${P3}.p3-t27_total[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: Monthly Income (33 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 5: Monthly Income ---
  // The IRS form has Taxpayer and Spouse columns for each line item

  // Line 45: Wages
  "income_wages_taxpayer": `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t1_45t[0]`,
  "income_wages_spouse": `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t2_45s[0]`,
  "income_wages": `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t3_45[0]`,

  // Line 46: Social Security
  "income_ss_taxpayer": `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t4_46t[0]`,
  "income_ss_spouse": `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t5_46s[0]`,
  "income_ss": `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t6_46[0]`,

  // Line 47: Pension/Annuity
  "income_pension_taxpayer": `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t7_47t[0]`,
  "income_pension_spouse": `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t8_47s[0]`,
  "income_pension": `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t9_47[0]`,

  // Line 48: Self-Employment
  "income_self_employment": `${P4}.TotalMonthlyIncome[0].Line48[0].p4-t10_48[0]`,

  // Line 49: Rental Income
  "income_rental": `${P4}.TotalMonthlyIncome[0].Line49[0].p4-t11_49[0]`,

  // Line 50: Interest & Dividends
  "income_interest_dividends": `${P4}.TotalMonthlyIncome[0].Line50[0].p4-t12_50[0]`,

  // Line 51: Distributions
  "income_distributions": `${P4}.TotalMonthlyIncome[0].Line51[0].p4-t13_51[0]`,

  // Line 52a: Child Support Received
  "income_child_support": `${P4}.TotalMonthlyIncome[0].Line52a[0].p4-t14_52a[0]`,

  // Line 52b: Alimony Received
  "income_alimony": `${P4}.TotalMonthlyIncome[0].Line52b[0].p4-t15_52b[0]`,

  // Line 53: Other Income
  "income_other": `${P4}.TotalMonthlyIncome[0].Line53[0].p4-t16_53[0]`,
  "income_other_description": `${P4}.TotalMonthlyIncome[0].Line53[0].p4-t17_53d[0]`,

  // Line 54: Total Monthly Income
  "total_monthly_income": `${P4}.TotalMonthlyIncome[0].Line54[0].p4-t18_54[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: Monthly Expenses (65 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 6: Monthly Expenses ---

  // Line 55: Food, Clothing & Miscellaneous
  "expense_food_clothing": `${P5}.TotalLivingExpenses[0].Line55[0].p5-t1_55[0]`,

  // Line 56: Housing and Utilities
  "expense_housing": `${P5}.TotalLivingExpenses[0].Line56[0].p5-t2_56[0]`,

  // Line 57: Vehicle Ownership (loan/lease)
  "expense_vehicle_ownership": `${P5}.TotalLivingExpenses[0].Line57[0].p5-t3_57[0]`,

  // Line 58: Vehicle Operating Costs
  "expense_vehicle_operating": `${P5}.TotalLivingExpenses[0].Line58[0].p5-t4_58[0]`,

  // Line 59: Public Transportation
  "expense_public_transit": `${P5}.TotalLivingExpenses[0].Line59[0].p5-t5_59[0]`,

  // Line 60: Health Insurance
  "expense_health_insurance": `${P5}.TotalLivingExpenses[0].Line60[0].p5-t6_60[0]`,

  // Line 61: Out-of-Pocket Medical/Dental
  "expense_medical": `${P5}.TotalLivingExpenses[0].Line61[0].p5-t7_61[0]`,

  // Line 62: Court-Ordered Payments
  "expense_court_ordered": `${P5}.TotalLivingExpenses[0].Line62[0].p5-t8_62[0]`,

  // Line 63: Child/Dependent Care
  "expense_child_care": `${P5}.TotalLivingExpenses[0].Line63[0].p5-t9_63[0]`,

  // Line 64: Term Life Insurance
  "expense_life_insurance": `${P5}.TotalLivingExpenses[0].Line64[0].p5-t10_64[0]`,

  // Line 65: Current Tax Payments
  "expense_taxes": `${P5}.TotalLivingExpenses[0].Line65[0].p5-t11_65[0]`,

  // Line 66: Secured Debt Payments
  "expense_secured_debts": `${P5}.TotalLivingExpenses[0].Line66[0].p5-t12_66[0]`,

  // Line 67: Delinquent State/Local Taxes
  "expense_delinquent_state_taxes": `${P5}.TotalLivingExpenses[0].Line67[0].p5-t13_67[0]`,

  // Line 67b: Other Necessary Expenses
  "expense_other": `${P5}.TotalLivingExpenses[0].Line67b[0].p5-t14_67b[0]`,
  "expense_other_description": `${P5}.TotalLivingExpenses[0].Line67b[0].p5-t15_67bd[0]`,

  // Line 68: Total Monthly Expenses
  "total_monthly_expenses": `${P5}.TotalLivingExpenses[0].Line68[0].p5-t16_68[0]`,

  // Line 69: Net Remaining Monthly Income
  "remaining_monthly_income": `${P5}.TotalLivingExpenses[0].Line69[0].p5-t17_69[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 6: Business Information (Self-Employed) (52 fields)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 7: Business Details ---
  "business_name_formal": `${P6}.Line30[0].p6-t1_30[0]`,
  "business_address": `${P6}.Line30[0].p6-t2_30[0]`,
  "business_phone": `${P6}.Line30[0].p6-t3_30[0]`,
  "business_ein_formal": `${P6}.Line30[0].p6-t4_30[0]`,
  "business_type_formal": `${P6}.Line30[0].p6-t5_30[0]`,
  "business_start_date": `${P6}.Line30[0].p6-t6_30[0]`,
  "number_employees": `${P6}.Line30[0].p6-t7_30[0]`,
  "business_website": `${P6}.Line30[0].p6-t8_30[0]`,

  // Business Bank Accounts
  "business_bank_accounts.0.bba_bank_name": `${P6}.Table_Line31[0].Row31a[0].p6-t9_31a[0]`,
  "business_bank_accounts.0.bba_account_type": `${P6}.Table_Line31[0].Row31a[0].p6-t10_31a[0]`,
  "business_bank_accounts.0.bba_balance": `${P6}.Table_Line31[0].Row31a[0].p6-t11_31a[0]`,
  "business_bank_accounts.1.bba_bank_name": `${P6}.Table_Line31[0].Row31b[0].p6-t9_31b[0]`,
  "business_bank_accounts.1.bba_account_type": `${P6}.Table_Line31[0].Row31b[0].p6-t10_31b[0]`,
  "business_bank_accounts.1.bba_balance": `${P6}.Table_Line31[0].Row31b[0].p6-t11_31b[0]`,

  // Business Vehicles
  "business_vehicles.0.bv_year": `${P6}.Table_Line32[0].Row32a[0].p6-t12_32a[0]`,
  "business_vehicles.0.bv_make": `${P6}.Table_Line32[0].Row32a[0].p6-t13_32a[0]`,
  "business_vehicles.0.bv_model": `${P6}.Table_Line32[0].Row32a[0].p6-t14_32a[0]`,
  "business_vehicles.0.bv_fmv": `${P6}.Table_Line32[0].Row32a[0].p6-t15_32a[0]`,
  "business_vehicles.0.bv_loan_balance": `${P6}.Table_Line32[0].Row32a[0].p6-t16_32a[0]`,
  "business_vehicles.1.bv_year": `${P6}.Table_Line32[0].Row32b[0].p6-t12_32b[0]`,
  "business_vehicles.1.bv_make": `${P6}.Table_Line32[0].Row32b[0].p6-t13_32b[0]`,
  "business_vehicles.1.bv_model": `${P6}.Table_Line32[0].Row32b[0].p6-t14_32b[0]`,
  "business_vehicles.1.bv_fmv": `${P6}.Table_Line32[0].Row32b[0].p6-t15_32b[0]`,
  "business_vehicles.1.bv_loan_balance": `${P6}.Table_Line32[0].Row32b[0].p6-t16_32b[0]`,

  // Business Equipment
  "business_equipment.0.be_description": `${P6}.Table_Line33[0].Row33a[0].p6-t17_33a[0]`,
  "business_equipment.0.be_fmv": `${P6}.Table_Line33[0].Row33a[0].p6-t18_33a[0]`,
  "business_equipment.0.be_loan_balance": `${P6}.Table_Line33[0].Row33a[0].p6-t19_33a[0]`,
  "business_equipment.1.be_description": `${P6}.Table_Line33[0].Row33b[0].p6-t17_33b[0]`,
  "business_equipment.1.be_fmv": `${P6}.Table_Line33[0].Row33b[0].p6-t18_33b[0]`,
  "business_equipment.1.be_loan_balance": `${P6}.Table_Line33[0].Row33b[0].p6-t19_33b[0]`,

  // Accounts Receivable & Inventory
  "business_accounts_receivable": `${P6}.Line34[0].p6-t20_34[0]`,
  "business_inventory": `${P6}.Line34[0].p6-t21_34[0]`,

  // --- Section 8: Business P&L ---
  "business_gross_receipts": `${P6}.Table_Line35[0].p6-t22_35[0]`,
  "business_returns_allowances": `${P6}.Table_Line35[0].p6-t23_35[0]`,
  "business_cost_of_goods": `${P6}.Table_Line35[0].p6-t24_35[0]`,
  "business_gross_profit": `${P6}.Table_Line35[0].p6-t25_35[0]`,

  // Business Expense Line Items
  "biz_exp_advertising": `${P6}.Table_Line36[0].p6-t26_36a[0]`,
  "biz_exp_insurance": `${P6}.Table_Line36[0].p6-t27_36b[0]`,
  "biz_exp_rent": `${P6}.Table_Line36[0].p6-t28_36c[0]`,
  "biz_exp_supplies": `${P6}.Table_Line36[0].p6-t29_36d[0]`,
  "biz_exp_utilities": `${P6}.Table_Line36[0].p6-t30_36e[0]`,
  "biz_exp_wages": `${P6}.Table_Line36[0].p6-t31_36f[0]`,
  "biz_exp_other": `${P6}.Table_Line36[0].p6-t32_36g[0]`,
  "biz_exp_total": `${P6}.Table_Line36[0].p6-t33_36[0]`,

  // Net Business Income
  "business_net_income": `${P6}.Line37[0].p6-t34_37[0]`,
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM 12153 — Request for Collection Due Process or Equivalent Hearing
// AcroForm field mapping
// ─────────────────────────────────────────────────────────────────────────────

const F12153_P1 = "topmostSubform[0].Page1[0]"
const F12153_P2 = "topmostSubform[0].Page2[0]"

const FORM_12153_FIELD_MAP: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Taxpayer Information & Collection Actions
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Line 1: Taxpayer Name ---
  "taxpayer_name": `${F12153_P1}.Line1[0].f12153-t1[0]`,

  // --- Line 2: SSN ---
  "ssn": `${F12153_P1}.Line2[0].f12153-t2[0]`,

  // --- Line 3: Address ---
  "address_street": `${F12153_P1}.Line3[0].f12153-t3[0]`,
  "address_city": `${F12153_P1}.Line3[0].f12153-t3c[0]`,
  "address_state": `${F12153_P1}.Line3[0].f12153-t3s[0]`,
  "address_zip": `${F12153_P1}.Line3[0].f12153-t3z[0]`,

  // --- Line 4: Phone ---
  "phone": `${F12153_P1}.Line4[0].f12153-t4[0]`,

  // --- Line 5: Spouse Info ---
  "spouse_name": `${F12153_P1}.Line5a[0].f12153-t5a[0]`,
  "spouse_ssn": `${F12153_P1}.Line5b[0].f12153-t5b[0]`,

  // --- Line 6: Representative Info ---
  "representative_name": `${F12153_P1}.Line6a[0].f12153-t6a[0]`,
  "representative_phone": `${F12153_P1}.Line6b[0].f12153-t6b[0]`,
  "caf_number": `${F12153_P1}.Line6c[0].f12153-t6c[0]`,

  // --- Line 7: Collection Action Type (checkboxes) ---
  "collection_action_type": `${F12153_P1}.Line7[0].f12153-cb7[0]`,

  // --- Line 8: Tax Periods ---
  "tax_periods.0.period_year": `${F12153_P1}.Table_Line8[0].Row1[0].f12153-t8y1[0]`,
  "tax_periods.0.period_tax_type": `${F12153_P1}.Table_Line8[0].Row1[0].f12153-t8t1[0]`,
  "tax_periods.0.period_amount": `${F12153_P1}.Table_Line8[0].Row1[0].f12153-t8a1[0]`,
  "tax_periods.1.period_year": `${F12153_P1}.Table_Line8[0].Row2[0].f12153-t8y2[0]`,
  "tax_periods.1.period_tax_type": `${F12153_P1}.Table_Line8[0].Row2[0].f12153-t8t2[0]`,
  "tax_periods.1.period_amount": `${F12153_P1}.Table_Line8[0].Row2[0].f12153-t8a2[0]`,
  "tax_periods.2.period_year": `${F12153_P1}.Table_Line8[0].Row3[0].f12153-t8y3[0]`,
  "tax_periods.2.period_tax_type": `${F12153_P1}.Table_Line8[0].Row3[0].f12153-t8t3[0]`,
  "tax_periods.2.period_amount": `${F12153_P1}.Table_Line8[0].Row3[0].f12153-t8a3[0]`,
  "tax_periods.3.period_year": `${F12153_P1}.Table_Line8[0].Row4[0].f12153-t8y4[0]`,
  "tax_periods.3.period_tax_type": `${F12153_P1}.Table_Line8[0].Row4[0].f12153-t8t4[0]`,
  "tax_periods.3.period_amount": `${F12153_P1}.Table_Line8[0].Row4[0].f12153-t8a4[0]`,
  "tax_periods.4.period_year": `${F12153_P1}.Table_Line8[0].Row5[0].f12153-t8y5[0]`,
  "tax_periods.4.period_tax_type": `${F12153_P1}.Table_Line8[0].Row5[0].f12153-t8t5[0]`,
  "tax_periods.4.period_amount": `${F12153_P1}.Table_Line8[0].Row5[0].f12153-t8a5[0]`,
  "tax_periods.5.period_year": `${F12153_P1}.Table_Line8[0].Row6[0].f12153-t8y6[0]`,
  "tax_periods.5.period_tax_type": `${F12153_P1}.Table_Line8[0].Row6[0].f12153-t8t6[0]`,
  "tax_periods.5.period_amount": `${F12153_P1}.Table_Line8[0].Row6[0].f12153-t8a6[0]`,
  "tax_periods.6.period_year": `${F12153_P1}.Table_Line8[0].Row7[0].f12153-t8y7[0]`,
  "tax_periods.6.period_tax_type": `${F12153_P1}.Table_Line8[0].Row7[0].f12153-t8t7[0]`,
  "tax_periods.6.period_amount": `${F12153_P1}.Table_Line8[0].Row7[0].f12153-t8a7[0]`,
  "tax_periods.7.period_year": `${F12153_P1}.Table_Line8[0].Row8[0].f12153-t8y8[0]`,
  "tax_periods.7.period_tax_type": `${F12153_P1}.Table_Line8[0].Row8[0].f12153-t8t8[0]`,
  "tax_periods.7.period_amount": `${F12153_P1}.Table_Line8[0].Row8[0].f12153-t8a8[0]`,

  // --- Line 9: IRS Notice Number ---
  "irs_notice_number": `${F12153_P1}.Line9[0].f12153-t9[0]`,

  // --- Line 10: Notice Date ---
  "notice_date": `${F12153_P1}.Line10[0].f12153-t10[0]`,

  // --- Line 11: Hearing Type ---
  "hearing_type": `${F12153_P1}.Line11[0].f12153-cb11[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: Proposed Resolution & Reasons
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Line 12: Proposed Resolution (checkboxes) ---
  "proposed_resolution": `${F12153_P2}.Line12[0].f12153-cb12[0]`,
  "other_resolution_details": `${F12153_P2}.Line12[0].f12153-t12other[0]`,

  // --- Line 13: Reasons for Disagreement ---
  "disagreement_reasons": `${F12153_P2}.Line13[0].f12153-t13[0]`,

  // --- Line 14: Additional Information ---
  "additional_information": `${F12153_P2}.Line14[0].f12153-t14[0]`,

  // --- Filing deadline / timely computed fields ---
  "filing_deadline": `${F12153_P2}.Line10b[0].f12153-t10b[0]`,
  "is_timely": `${F12153_P2}.Line10c[0].f12153-cb10c[0]`,
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM 911 — Request for Taxpayer Advocate Service Assistance
// AcroForm field mapping
// ─────────────────────────────────────────────────────────────────────────────

const F911_P1 = "topmostSubform[0].Page1[0]"
const F911_P2 = "topmostSubform[0].Page2[0]"

const FORM_911_FIELD_MAP: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Taxpayer & Representative Information
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 1: Taxpayer Information ---
  // Line 1a: Taxpayer Name
  "taxpayer_name": `${F911_P1}.Line1a[0].f911-t1a[0]`,
  // Line 1b: SSN
  "ssn": `${F911_P1}.Line1b[0].f911-t1b[0]`,
  // Line 2: Address
  "address_street": `${F911_P1}.Line2[0].f911-t2[0]`,
  "address_city": `${F911_P1}.Line2[0].f911-t2c[0]`,
  "address_state": `${F911_P1}.Line2[0].f911-t2s[0]`,
  "address_zip": `${F911_P1}.Line2[0].f911-t2z[0]`,
  // Line 3: Phone
  "phone": `${F911_P1}.Line3[0].f911-t3[0]`,
  // Line 4: Email
  "email": `${F911_P1}.Line4[0].f911-t4[0]`,
  // Line 5a: Spouse Name
  "spouse_name": `${F911_P1}.Line5a[0].f911-t5a[0]`,
  // Line 5b: Spouse SSN
  "spouse_ssn": `${F911_P1}.Line5b[0].f911-t5b[0]`,
  // Line 6: Tax Form Number
  "tax_form_number": `${F911_P1}.Line6[0].f911-t6[0]`,
  // Line 7: Tax Periods
  "tax_periods.0.period_year": `${F911_P1}.Line7[0].f911-t7a[0]`,
  "tax_periods.1.period_year": `${F911_P1}.Line7[0].f911-t7b[0]`,
  "tax_periods.2.period_year": `${F911_P1}.Line7[0].f911-t7c[0]`,
  "tax_periods.3.period_year": `${F911_P1}.Line7[0].f911-t7d[0]`,

  // --- Section 2: Representative Information ---
  // Line 8: Has representative
  "has_representative": `${F911_P1}.Line8[0].f911-cb8[0]`,
  // Line 9a: Representative Name
  "rep_name": `${F911_P1}.Line9a[0].f911-t9a[0]`,
  // Line 9b: Representative Phone
  "rep_phone": `${F911_P1}.Line9b[0].f911-t9b[0]`,
  // Line 9c: CAF Number
  "rep_caf": `${F911_P1}.Line9c[0].f911-t9c[0]`,
  // Line 10: Form 2848 on file
  "rep_centralized_auth": `${F911_P1}.Line10[0].f911-cb10[0]`,

  // --- Section 3: IRS Contact Information ---
  // Line 11a: IRS Employee Name
  "irs_employee_name": `${F911_P1}.Line11a[0].f911-t11a[0]`,
  // Line 11b: IRS Employee ID
  "irs_employee_id": `${F911_P1}.Line11b[0].f911-t11b[0]`,
  // Line 11c: IRS Office
  "irs_office": `${F911_P1}.Line11c[0].f911-t11c[0]`,
  // Line 11d: Contact Date
  "contact_date": `${F911_P1}.Line11d[0].f911-t11d[0]`,
  // Line 12: IRS Response
  "irs_response": `${F911_P1}.Line12[0].f911-t12[0]`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: Description of Problem & Relief Requested
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Section 4: Problem & Relief ---
  // Line 13: Hardship Category (checkbox)
  "hardship_category": `${F911_P2}.Line13[0].f911-cb13[0]`,
  // Line 14: Problem Description
  "problem_description": `${F911_P2}.Line14[0].f911-t14[0]`,
  // Line 15: Attempts to Resolve
  "attempts_to_resolve": `${F911_P2}.Line15[0].f911-t15[0]`,
  // Line 16: Relief Requested
  "relief_requested": `${F911_P2}.Line16[0].f911-t16[0]`,
  // Line 17: Hardship Explanation
  "hardship_explanation": `${F911_P2}.Line17[0].f911-t17[0]`,
  // Line 18: Supporting Documents
  "supporting_documents": `${F911_P2}.Line18[0].f911-t18[0]`,
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined field map selector based on form number
// ─────────────────────────────────────────────────────────────────────────────

async function getFieldMap(formNumber: string): Promise<Record<string, string>> {
  // 1. Try AI-powered auto-mapping first
  try {
    const autoMap = await getAutoMapping(formNumber)
    if (autoMap && Object.keys(autoMap.mappings).length > 0) {
      console.log(`[PDF FILL] Using auto-map for ${formNumber}: ${Object.keys(autoMap.mappings).length} fields, confidence ${autoMap.confidence}%`)
      return autoMap.mappings
    }
  } catch (e: any) {
    console.warn(`[PDF FILL] Auto-map failed for ${formNumber}, falling back to manual maps: ${e.message}`)
  }

  // 2. Try the centralized PDF map registry
  const registryMap = getAcroFieldMap(formNumber)
  if (registryMap && Object.keys(registryMap).length > 0) {
    console.log(`[PDF FILL] Using registry map for ${formNumber}: ${Object.keys(registryMap).length} fields`)
    return registryMap
  }

  // 3. Fall back to inline maps for forms not yet migrated to the registry
  console.log(`[PDF FILL] Using inline map for ${formNumber}`)
  switch (formNumber) {
    case "433-A":
    case "433-A-OIC":
      return FORM_433A_FIELD_MAP
    case "12153":
      return FORM_12153_FIELD_MAP
    case "911":
      return FORM_911_FIELD_MAP
    default:
      return FORM_433A_FIELD_MAP
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let values: Record<string, any> = {}
  let formNumber = "433-A"

  try {
    const body = await request.json()
    values = body.values || {}
    formNumber = body.formNumber || "433-A"
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const pdfFileName = FORM_PDF_FILES[formNumber] || getPDFFileName(formNumber)
  if (!pdfFileName) {
    return NextResponse.json({ error: "PDF not available" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { instanceId } = params
  let values: Record<string, any> = {}
  let formNumber = "433-A"

  const instance = getFormInstance(instanceId)
  if (instance) {
    values = instance.values || {}
    formNumber = instance.formNumber || "433-A"
  }

  const pdfFileName = FORM_PDF_FILES[formNumber] || getPDFFileName(formNumber)
  if (!pdfFileName) {
    return NextResponse.json({ error: "PDF not available" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

async function generateFilledPDF(formNumber: string, values: Record<string, any>, pdfFileName: string) {
  try {
    const pdfPath = join(process.cwd(), "public", "forms", pdfFileName)
    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

    // Select the correct field map for this form (tries AI auto-map, then registry, then inline)
    const fieldMap = await getFieldMap(formNumber)

    // DEBUG MODE: report field info and test results
    if (Object.keys(values).length > 0) {
      const form = pdfDoc.getForm()
      const allFields = form.getFields()
      const firstFieldName = allFields[0]?.getName()
      const testResults: string[] = []

      try {
        const tf = form.getTextField(firstFieldName)
        tf.setText("TEST_VALUE")
        testResults.push(`SUCCESS: getTextField('${firstFieldName}') worked, setText succeeded`)
      } catch (e: any) {
        testResults.push(`FAILED getTextField: ${e.message}`)
        try {
          const f = allFields[0]
          testResults.push(`Field class: ${f.constructor.name}`)
          testResults.push(`Field acroField: ${JSON.stringify(Object.keys(f))}`)
        } catch (e2: any) {
          testResults.push(`Inspection failed: ${e2.message}`)
        }
      }

      const isDebug = new URL("http://x?" + (values._debug || "")).searchParams.has("debug") || values._debug === true
      if (isDebug) {
        return NextResponse.json({
          fieldCount: allFields.length,
          firstField: firstFieldName,
          testResults,
          valuesReceived: Object.keys(values),
          mappedFieldCount: Object.keys(fieldMap).length,
        })
      }
    }

    // Flatten repeating groups from nested arrays to dot-notation keys
    const flatValues: Record<string, any> = {}
    for (const [key, val] of Object.entries(values)) {
      if (Array.isArray(val)) {
        val.forEach((entry: Record<string, any>, idx: number) => {
          if (entry && typeof entry === "object") {
            for (const [subKey, subVal] of Object.entries(entry)) {
              flatValues[`${key}.${idx}.${subKey}`] = subVal
            }
          }
        })
      } else {
        flatValues[key] = val
      }
    }

    // Get the form — pdf-lib strips XFA but keeps AcroForm fields
    const form = pdfDoc.getForm()
    const fields = form.getFields()
    let filledCount = 0
    const errors: string[] = []

    console.log(`[PDF FILL] Form ${formNumber} has ${fields.length} AcroForm fields, field map has ${Object.keys(fieldMap).length} entries`)

    // Build a set of actual PDF field names for fuzzy matching fallback
    const actualFieldNames = new Set(fields.map(f => f.getName()))

    // Fill fields using exact name mapping
    for (const [ourId, value] of Object.entries(flatValues)) {
      if (value === undefined || value === null || value === "") continue
      if (ourId === "_debug") continue

      const pdfFieldName = fieldMap[ourId]
      if (!pdfFieldName) continue

      try {
        // Check if this is a checkbox/yes-no field
        if (typeof value === "boolean") {
          try {
            const checkbox = form.getCheckBox(pdfFieldName)
            if (value) checkbox.check()
            else checkbox.uncheck()
            filledCount++
            continue
          } catch {
            // Not a checkbox — fall through to text field
          }
        }

        const textField = form.getTextField(pdfFieldName)
        let displayValue = String(value)
        if (typeof value === "boolean") displayValue = value ? "Yes" : "No"
        textField.setText(displayValue)
        filledCount++
      } catch (e: any) {
        // Try without the full path — just the field name after the last dot
        const shortName = pdfFieldName.split(".").pop() || pdfFieldName
        if (actualFieldNames.has(shortName)) {
          try {
            const textField = form.getTextField(shortName)
            textField.setText(String(value))
            filledCount++
            continue
          } catch {
            // Also failed with short name
          }
        }
        errors.push(`${ourId} → ${pdfFieldName}: ${e?.message?.slice(0, 80)}`)
      }
    }

    console.log(`[PDF FILL] Filled ${filledCount} fields, ${errors.length} errors`)
    if (errors.length > 0) console.log(`[PDF FILL] Errors: ${errors.slice(0, 10).join("; ")}`)

    // Flatten form so values render as text
    form.flatten()

    const filledPdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(filledPdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${formNumber}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error: any) {
    console.error("PDF generation error:", error)
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 })
  }
}
