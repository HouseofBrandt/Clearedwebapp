import type { PDFFieldMap } from "./types"

// AcroForm page prefixes
const P1 = "topmostSubform[0].Page1[0]"
const P2 = "topmostSubform[0].Page2[0]"
const P3 = "topmostSubform[0].Page3[0]"
const P4 = "topmostSubform[0].Page4[0]"
const P5 = "topmostSubform[0].Page5[0]"
const P6 = "topmostSubform[0].Page6[0]"

export const FORM_433A_PDF_MAP: PDFFieldMap = {
  formNumber: "433-A",
  pdfFile: "f433a.pdf",
  strategy: "hybrid",
  fields: {
    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 1: Personal Information
    // ═══════════════════════════════════════════════════════════════════════════

    "taxpayer_name": {
      acroFieldName: `${P1}.c1[0].Lines1a-b[0].p1-t4[0]`,
      coordinate: { page: 0, x: 55, y: 580, fontSize: 9, maxWidth: 300 },
    },
    "address_street": {
      acroFieldName: `${P1}.c1[0].Lines1a-b[0].p1-t5[0]`,
      coordinate: { page: 0, x: 55, y: 550, fontSize: 9, maxWidth: 350 },
    },
    "county": {
      acroFieldName: `${P1}.c1[0].Line1c[0].p1-t6c[0]`,
      coordinate: { page: 0, x: 55, y: 490, fontSize: 9, maxWidth: 200 },
    },
    "home_phone": {
      acroFieldName: `${P1}.c1[0].Line1c[0].p1-t7c[0]`,
      coordinate: { page: 0, x: 310, y: 490, fontSize: 9, maxWidth: 120 },
    },
    "cell_phone": {
      acroFieldName: `${P1}.c1[0].Line1d[0].p1-t8d[0]`,
      coordinate: { page: 0, x: 55, y: 470, fontSize: 9, maxWidth: 120 },
    },
    "work_phone": {
      acroFieldName: `${P1}.c1[0].Line1e[0].p1-t10e[0]`,
      coordinate: { page: 0, x: 310, y: 470, fontSize: 9, maxWidth: 120 },
    },
    "marital_status": {
      acroFieldName: `${P1}.c1[0].C1_01_2a[0]`,
      coordinate: { page: 0, x: 145, y: 430, fontSize: 9, maxWidth: 100 },
    },
    "ssn": {
      acroFieldName: `${P1}.c1[0].Table_Part4-Line5[0].Row1[0].F02_030_0_[0]`,
      coordinate: { page: 0, x: 55, y: 395, fontSize: 9, maxWidth: 120 },
    },
    "dob": {
      acroFieldName: `${P1}.c1[0].Table_Part4-Line5[0].Row1[0].F02_031_0_[0]`,
      coordinate: { page: 0, x: 370, y: 395, fontSize: 9, maxWidth: 80 },
    },
    "spouse_ssn": {
      acroFieldName: `${P1}.c1[0].Table_Part4-Line5[0].Row2[0].F02_034_0_[0]`,
      coordinate: { page: 0, x: 55, y: 385, fontSize: 9, maxWidth: 120 },
    },
    "spouse_dob": {
      acroFieldName: `${P1}.c1[0].Table_Part4-Line5[0].Row2[0].F02_035_0_[0]`,
      coordinate: { page: 0, x: 370, y: 385, fontSize: 9, maxWidth: 80 },
    },
    "spouse_name": {
      acroFieldName: `${P1}.c1[0].Lines1a-b[1].p1-t4[0]`,
      coordinate: { page: 0, x: 310, y: 580, fontSize: 9, maxWidth: 200 },
    },
    "address_city": {
      coordinate: { page: 0, x: 55, y: 530, fontSize: 9, maxWidth: 140 },
    },
    "address_state": {
      coordinate: { page: 0, x: 200, y: 530, fontSize: 9, maxWidth: 50 },
    },
    "address_zip": {
      coordinate: { page: 0, x: 260, y: 530, fontSize: 9, maxWidth: 70 },
    },

    // Dependents
    "dependents.0.dep_name": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Name[0]`,
      coordinate: { page: 0, x: 390, y: 565, fontSize: 8, maxWidth: 100 },
    },
    "dependents.0.dep_age": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Age[0]`,
      coordinate: { page: 0, x: 500, y: 565, fontSize: 8, maxWidth: 30 },
    },
    "dependents.0.dep_relationship": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row1[0].Relationship[0]`,
      coordinate: { page: 0, x: 540, y: 565, fontSize: 8, maxWidth: 50 },
    },
    "dependents.1.dep_name": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Name[0]`,
      coordinate: { page: 0, x: 390, y: 550, fontSize: 8, maxWidth: 100 },
    },
    "dependents.1.dep_age": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Age[0]`,
      coordinate: { page: 0, x: 500, y: 550, fontSize: 8, maxWidth: 30 },
    },
    "dependents.1.dep_relationship": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row2[0].Relationship[0]`,
      coordinate: { page: 0, x: 540, y: 550, fontSize: 8, maxWidth: 50 },
    },
    "dependents.2.dep_name": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Name[0]`,
      coordinate: { page: 0, x: 390, y: 535, fontSize: 8, maxWidth: 100 },
    },
    "dependents.2.dep_age": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Age[0]`,
      coordinate: { page: 0, x: 500, y: 535, fontSize: 8, maxWidth: 30 },
    },
    "dependents.2.dep_relationship": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row3[0].Relationship[0]`,
      coordinate: { page: 0, x: 540, y: 535, fontSize: 8, maxWidth: 50 },
    },
    "dependents.3.dep_name": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Name[0]`,
      coordinate: { page: 0, x: 390, y: 520, fontSize: 8, maxWidth: 100 },
    },
    "dependents.3.dep_age": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Age[0]`,
      coordinate: { page: 0, x: 500, y: 520, fontSize: 8, maxWidth: 30 },
    },
    "dependents.3.dep_relationship": {
      acroFieldName: `${P1}.c2[0].ClaimedAsDependents[0].Row4[0].Relationship[0]`,
      coordinate: { page: 0, x: 540, y: 520, fontSize: 8, maxWidth: 50 },
    },

    // Yes/No questions
    "filed_bankruptcy": { acroFieldName: `${P1}.c2[0].Line4[0].p1-cb4[0]` },
    "involved_lawsuit": { acroFieldName: `${P1}.c2[0].Line5[0].p1-cb5[0]` },
    "transferred_assets": { acroFieldName: `${P1}.c2[0].Line6[0].p1-cb6[0]` },
    "anticipated_income_change": { acroFieldName: `${P1}.c2[0].Line7[0].p1-cb7[0]` },
    "trust_interest": { acroFieldName: `${P1}.c2[0].Line8[0].p1-cb8[0]` },
    "lived_outside_us": { acroFieldName: `${P1}.c2[0].Line9[0].p1-cb9[0]` },
    "bankruptcy_date": {
      acroFieldName: `${P1}.c2[0].Line4[0].p1-t20_4[0]`,
      coordinate: { page: 3, x: 150, y: 530, fontSize: 8, maxWidth: 100 },
    },
    "lawsuit_details": {
      acroFieldName: `${P1}.c2[0].Line5[0].p1-t21_5[0]`,
      coordinate: { page: 3, x: 150, y: 500, fontSize: 8, maxWidth: 400 },
    },
    "transfer_details": {
      acroFieldName: `${P1}.c2[0].Line6[0].p1-t22_6[0]`,
      coordinate: { page: 3, x: 150, y: 470, fontSize: 8, maxWidth: 400 },
    },
    "income_change_details": {
      acroFieldName: `${P1}.c2[0].Line7[0].p1-t23_7[0]`,
      coordinate: { page: 3, x: 150, y: 440, fontSize: 8, maxWidth: 400 },
    },
    "trust_details": {
      acroFieldName: `${P1}.c2[0].Line8[0].p1-t24_8[0]`,
      coordinate: { page: 3, x: 150, y: 410, fontSize: 8, maxWidth: 400 },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 2: Employment & Self-Employment
    // ═══════════════════════════════════════════════════════════════════════════

    "employment_type": { acroFieldName: `${P2}.Line10[0].p2-cb10[0]` },

    // Employer 1
    "employers.0.emp_name": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t1_12a[0]`,
      coordinate: { page: 1, x: 62, y: 680, fontSize: 8, maxWidth: 200 },
    },
    "employers.0.emp_address": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t2_12a[0]`,
      coordinate: { page: 1, x: 62, y: 665, fontSize: 8, maxWidth: 300 },
    },
    "employers.0.emp_phone": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t3_12a[0]`,
      coordinate: { page: 1, x: 400, y: 680, fontSize: 8, maxWidth: 150 },
    },
    "employers.0.emp_ein": { acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t4_12a[0]` },
    "employers.0.emp_hire_date": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t5_12a[0]`,
      coordinate: { page: 1, x: 400, y: 665, fontSize: 8, maxWidth: 80 },
    },
    "employers.0.emp_gross_monthly": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t6_12a[0]`,
      coordinate: { page: 1, x: 400, y: 650, fontSize: 8, maxWidth: 80 },
    },
    "employers.0.emp_net_monthly": {
      acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t7_12a[0]`,
      coordinate: { page: 1, x: 500, y: 650, fontSize: 8, maxWidth: 80 },
    },
    "employers.0.emp_pay_frequency": { acroFieldName: `${P2}.Table_Line13[0].Line12a[0].p2-t8_12a[0]` },

    // Employer 2
    "employers.1.emp_name": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t1_12b[0]`,
      coordinate: { page: 1, x: 62, y: 620, fontSize: 8, maxWidth: 200 },
    },
    "employers.1.emp_address": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t2_12b[0]`,
      coordinate: { page: 1, x: 62, y: 605, fontSize: 8, maxWidth: 300 },
    },
    "employers.1.emp_phone": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t3_12b[0]`,
      coordinate: { page: 1, x: 400, y: 620, fontSize: 8, maxWidth: 150 },
    },
    "employers.1.emp_ein": { acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t4_12b[0]` },
    "employers.1.emp_hire_date": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t5_12b[0]`,
      coordinate: { page: 1, x: 400, y: 605, fontSize: 8, maxWidth: 80 },
    },
    "employers.1.emp_gross_monthly": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t6_12b[0]`,
      coordinate: { page: 1, x: 400, y: 590, fontSize: 8, maxWidth: 80 },
    },
    "employers.1.emp_net_monthly": {
      acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t7_12b[0]`,
      coordinate: { page: 1, x: 500, y: 590, fontSize: 8, maxWidth: 80 },
    },
    "employers.1.emp_pay_frequency": { acroFieldName: `${P2}.Table_Line13[0].Line12b[0].p2-t8_12b[0]` },

    // Self-employment
    "business_name": {
      acroFieldName: `${P2}.Line13[0].p2-t9_13[0]`,
      coordinate: { page: 1, x: 62, y: 540, fontSize: 8, maxWidth: 200 },
    },
    "business_ein": {
      acroFieldName: `${P2}.Line13[0].p2-t10_13[0]`,
      coordinate: { page: 1, x: 300, y: 540, fontSize: 8, maxWidth: 100 },
    },
    "business_type": {
      acroFieldName: `${P2}.Line13[0].p2-t11_13[0]`,
      coordinate: { page: 1, x: 420, y: 540, fontSize: 8, maxWidth: 140 },
    },
    "business_gross_monthly": {
      acroFieldName: `${P2}.Line13[0].p2-t12_13[0]`,
      coordinate: { page: 1, x: 400, y: 510, fontSize: 8, maxWidth: 80 },
    },
    "business_expenses_monthly": {
      acroFieldName: `${P2}.Line13[0].p2-t13_13[0]`,
      coordinate: { page: 1, x: 500, y: 510, fontSize: 8, maxWidth: 80 },
    },
    "business_net_monthly": {
      acroFieldName: `${P2}.Line13[0].p2-t14_13[0]`,
      coordinate: { page: 1, x: 400, y: 495, fontSize: 8, maxWidth: 80 },
    },

    // Bank accounts
    "cash_on_hand": {
      acroFieldName: `${P2}.Table_Line14[0].Row12[0].p2-t15_12[0]`,
      coordinate: { page: 2, x: 452, y: 700, fontSize: 9, maxWidth: 100 },
    },
    "bank_accounts.0.bank_name": {
      acroFieldName: `${P2}.Table_Line14[0].Row13a[0].p2-t16_13a[0]`,
      coordinate: { page: 2, x: 62, y: 660, fontSize: 8, maxWidth: 160 },
    },
    "bank_accounts.0.bank_account_type": {
      acroFieldName: `${P2}.Table_Line14[0].Row13a[0].p2-t17_13a[0]`,
      coordinate: { page: 2, x: 240, y: 660, fontSize: 8, maxWidth: 80 },
    },
    "bank_accounts.0.bank_balance": {
      acroFieldName: `${P2}.Table_Line14[0].Row13a[0].p2-t18_13a[0]`,
      coordinate: { page: 2, x: 452, y: 660, fontSize: 8, maxWidth: 100 },
    },
    "bank_accounts.1.bank_name": {
      acroFieldName: `${P2}.Table_Line14[0].Row13b[0].p2-t16_13b[0]`,
      coordinate: { page: 2, x: 62, y: 646, fontSize: 8, maxWidth: 160 },
    },
    "bank_accounts.1.bank_account_type": {
      acroFieldName: `${P2}.Table_Line14[0].Row13b[0].p2-t17_13b[0]`,
      coordinate: { page: 2, x: 240, y: 646, fontSize: 8, maxWidth: 80 },
    },
    "bank_accounts.1.bank_balance": {
      acroFieldName: `${P2}.Table_Line14[0].Row13b[0].p2-t18_13b[0]`,
      coordinate: { page: 2, x: 452, y: 646, fontSize: 8, maxWidth: 100 },
    },
    "bank_accounts.2.bank_name": {
      acroFieldName: `${P2}.Table_Line14[0].Row13c[0].p2-t16_13c[0]`,
      coordinate: { page: 2, x: 62, y: 632, fontSize: 8, maxWidth: 160 },
    },
    "bank_accounts.2.bank_account_type": {
      acroFieldName: `${P2}.Table_Line14[0].Row13c[0].p2-t17_13c[0]`,
      coordinate: { page: 2, x: 240, y: 632, fontSize: 8, maxWidth: 80 },
    },
    "bank_accounts.2.bank_balance": {
      acroFieldName: `${P2}.Table_Line14[0].Row13c[0].p2-t18_13c[0]`,
      coordinate: { page: 2, x: 452, y: 632, fontSize: 8, maxWidth: 100 },
    },
    "total_bank_balances": {
      acroFieldName: `${P3}.p3-t27_total[0]`,
      coordinate: { page: 2, x: 452, y: 618, fontSize: 9, maxWidth: 100 },
    },

    // Investments
    "investments.0.inv_institution": {
      acroFieldName: `${P2}.Table_Line14[0].Row14a[0].p2-t19_14a[0]`,
      coordinate: { page: 2, x: 62, y: 585, fontSize: 8, maxWidth: 140 },
    },
    "investments.0.inv_type": {
      acroFieldName: `${P2}.Table_Line14[0].Row14a[0].p2-t20_14a[0]`,
      coordinate: { page: 2, x: 210, y: 585, fontSize: 8, maxWidth: 80 },
    },
    "investments.0.inv_balance": {
      acroFieldName: `${P2}.Table_Line14[0].Row14a[0].p2-t21_14a[0]`,
      coordinate: { page: 2, x: 310, y: 585, fontSize: 8, maxWidth: 70 },
    },
    "investments.0.inv_loan": {
      acroFieldName: `${P2}.Table_Line14[0].Row14a[0].p2-t22_14a[0]`,
      coordinate: { page: 2, x: 400, y: 585, fontSize: 8, maxWidth: 70 },
    },
    "investments.1.inv_institution": {
      acroFieldName: `${P2}.Table_Line14[0].Row14b[0].p2-t19_14b[0]`,
      coordinate: { page: 2, x: 62, y: 571, fontSize: 8, maxWidth: 140 },
    },
    "investments.1.inv_type": {
      acroFieldName: `${P2}.Table_Line14[0].Row14b[0].p2-t20_14b[0]`,
      coordinate: { page: 2, x: 210, y: 571, fontSize: 8, maxWidth: 80 },
    },
    "investments.1.inv_balance": {
      acroFieldName: `${P2}.Table_Line14[0].Row14b[0].p2-t21_14b[0]`,
      coordinate: { page: 2, x: 310, y: 571, fontSize: 8, maxWidth: 70 },
    },
    "investments.1.inv_loan": {
      acroFieldName: `${P2}.Table_Line14[0].Row14b[0].p2-t22_14b[0]`,
      coordinate: { page: 2, x: 400, y: 571, fontSize: 8, maxWidth: 70 },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 3: Real Property, Vehicles, Other Assets
    // ═══════════════════════════════════════════════════════════════════════════

    // Real Property
    "real_property.0.prop_description": {
      acroFieldName: `${P3}.Table_Line17a[0].p3-t1_17a[0]`,
      coordinate: { page: 2, x: 62, y: 510, fontSize: 8, maxWidth: 140 },
    },
    "real_property.0.prop_address": { acroFieldName: `${P3}.Table_Line17a[0].p3-t2_17a[0]` },
    "real_property.0.prop_fmv": {
      acroFieldName: `${P3}.Table_Line17a[0].p3-t3_17a[0]`,
      coordinate: { page: 2, x: 210, y: 510, fontSize: 8, maxWidth: 70 },
    },
    "real_property.0.prop_loan": {
      acroFieldName: `${P3}.Table_Line17a[0].p3-t4_17a[0]`,
      coordinate: { page: 2, x: 300, y: 510, fontSize: 8, maxWidth: 70 },
    },
    "real_property.0.prop_equity": { acroFieldName: `${P3}.Table_Line17a[0].p3-t5_17a[0]` },
    "real_property.0.prop_monthly_payment": {
      acroFieldName: `${P3}.Table_Line17a[0].p3-t6_17a[0]`,
      coordinate: { page: 2, x: 470, y: 510, fontSize: 8, maxWidth: 60 },
    },
    "real_property.0.prop_lender": {
      acroFieldName: `${P3}.Table_Line17a[0].p3-t7_17a[0]`,
      coordinate: { page: 2, x: 62, y: 496, fontSize: 8, maxWidth: 200 },
    },
    "real_property.1.prop_description": {
      acroFieldName: `${P3}.Table_Line17b[0].p3-t1_17b[0]`,
      coordinate: { page: 2, x: 62, y: 475, fontSize: 8, maxWidth: 140 },
    },
    "real_property.1.prop_address": { acroFieldName: `${P3}.Table_Line17b[0].p3-t2_17b[0]` },
    "real_property.1.prop_fmv": {
      acroFieldName: `${P3}.Table_Line17b[0].p3-t3_17b[0]`,
      coordinate: { page: 2, x: 210, y: 475, fontSize: 8, maxWidth: 70 },
    },
    "real_property.1.prop_loan": {
      acroFieldName: `${P3}.Table_Line17b[0].p3-t4_17b[0]`,
      coordinate: { page: 2, x: 300, y: 475, fontSize: 8, maxWidth: 70 },
    },
    "real_property.1.prop_equity": { acroFieldName: `${P3}.Table_Line17b[0].p3-t5_17b[0]` },
    "real_property.1.prop_monthly_payment": {
      acroFieldName: `${P3}.Table_Line17b[0].p3-t6_17b[0]`,
      coordinate: { page: 2, x: 470, y: 475, fontSize: 8, maxWidth: 60 },
    },
    "real_property.1.prop_lender": {
      acroFieldName: `${P3}.Table_Line17b[0].p3-t7_17b[0]`,
      coordinate: { page: 2, x: 62, y: 461, fontSize: 8, maxWidth: 200 },
    },

    // Retirement Accounts
    "retirement_accounts.0.ret_institution": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c1[0].p3-t8_17c[0]`,
      coordinate: { page: 2, x: 62, y: 420, fontSize: 8, maxWidth: 140 },
    },
    "retirement_accounts.0.ret_type": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c1[0].p3-t9_17c[0]`,
      coordinate: { page: 2, x: 210, y: 420, fontSize: 8, maxWidth: 80 },
    },
    "retirement_accounts.0.ret_balance": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c1[0].p3-t10_17c[0]`,
      coordinate: { page: 2, x: 310, y: 420, fontSize: 8, maxWidth: 70 },
    },
    "retirement_accounts.0.ret_loan": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c1[0].p3-t11_17c[0]`,
      coordinate: { page: 2, x: 400, y: 420, fontSize: 8, maxWidth: 70 },
    },
    "retirement_accounts.1.ret_institution": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c2[0].p3-t8_17c2[0]`,
      coordinate: { page: 2, x: 62, y: 406, fontSize: 8, maxWidth: 140 },
    },
    "retirement_accounts.1.ret_type": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c2[0].p3-t9_17c2[0]`,
      coordinate: { page: 2, x: 210, y: 406, fontSize: 8, maxWidth: 80 },
    },
    "retirement_accounts.1.ret_balance": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c2[0].p3-t10_17c2[0]`,
      coordinate: { page: 2, x: 310, y: 406, fontSize: 8, maxWidth: 70 },
    },
    "retirement_accounts.1.ret_loan": {
      acroFieldName: `${P3}.Table_Line17c[0].Row17c2[0].p3-t11_17c2[0]`,
      coordinate: { page: 2, x: 400, y: 406, fontSize: 8, maxWidth: 70 },
    },

    // Vehicles
    "vehicles.0.veh_year": {
      acroFieldName: `${P3}.Line18a[0].p3-t12_18a[0]`,
      coordinate: { page: 2, x: 62, y: 360, fontSize: 8, maxWidth: 40 },
    },
    "vehicles.0.veh_make": {
      acroFieldName: `${P3}.Line18a[0].p3-t13_18a[0]`,
      coordinate: { page: 2, x: 110, y: 360, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.0.veh_model": {
      acroFieldName: `${P3}.Line18a[0].p3-t14_18a[0]`,
      coordinate: { page: 2, x: 175, y: 360, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.0.veh_mileage": {
      acroFieldName: `${P3}.Line18a[0].p3-t15_18a[0]`,
      coordinate: { page: 2, x: 245, y: 360, fontSize: 8, maxWidth: 50 },
    },
    "vehicles.0.veh_fmv": {
      acroFieldName: `${P3}.Line18a[0].p3-t16_18a[0]`,
      coordinate: { page: 2, x: 310, y: 360, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.0.veh_loan": {
      acroFieldName: `${P3}.Line18a[0].p3-t17_18a[0]`,
      coordinate: { page: 2, x: 380, y: 360, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.0.veh_equity": { acroFieldName: `${P3}.Line18a[0].p3-t18_18a[0]` },
    "vehicles.0.veh_monthly_payment": {
      acroFieldName: `${P3}.Line18a[0].p3-t19_18a[0]`,
      coordinate: { page: 2, x: 500, y: 360, fontSize: 8, maxWidth: 50 },
    },
    "vehicles.0.veh_lender": {
      acroFieldName: `${P3}.Line18a[0].p3-t20_18a[0]`,
      coordinate: { page: 2, x: 62, y: 346, fontSize: 8, maxWidth: 200 },
    },
    "vehicles.1.veh_year": {
      acroFieldName: `${P3}.Line18b[0].p3-t12_18b[0]`,
      coordinate: { page: 2, x: 62, y: 325, fontSize: 8, maxWidth: 40 },
    },
    "vehicles.1.veh_make": {
      acroFieldName: `${P3}.Line18b[0].p3-t13_18b[0]`,
      coordinate: { page: 2, x: 110, y: 325, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.1.veh_model": {
      acroFieldName: `${P3}.Line18b[0].p3-t14_18b[0]`,
      coordinate: { page: 2, x: 175, y: 325, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.1.veh_mileage": {
      acroFieldName: `${P3}.Line18b[0].p3-t15_18b[0]`,
      coordinate: { page: 2, x: 245, y: 325, fontSize: 8, maxWidth: 50 },
    },
    "vehicles.1.veh_fmv": {
      acroFieldName: `${P3}.Line18b[0].p3-t16_18b[0]`,
      coordinate: { page: 2, x: 310, y: 325, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.1.veh_loan": {
      acroFieldName: `${P3}.Line18b[0].p3-t17_18b[0]`,
      coordinate: { page: 2, x: 380, y: 325, fontSize: 8, maxWidth: 60 },
    },
    "vehicles.1.veh_equity": { acroFieldName: `${P3}.Line18b[0].p3-t18_18b[0]` },
    "vehicles.1.veh_monthly_payment": {
      acroFieldName: `${P3}.Line18b[0].p3-t19_18b[0]`,
      coordinate: { page: 2, x: 500, y: 325, fontSize: 8, maxWidth: 50 },
    },
    "vehicles.1.veh_lender": {
      acroFieldName: `${P3}.Line18b[0].p3-t20_18b[0]`,
      coordinate: { page: 2, x: 62, y: 311, fontSize: 8, maxWidth: 200 },
    },

    // Life insurance
    "life_insurance_csv": {
      acroFieldName: `${P3}.Line19[0].p3-t21_19[0]`,
      coordinate: { page: 2, x: 452, y: 280, fontSize: 9, maxWidth: 100 },
    },

    // Safe deposit box
    "has_safe_deposit": { acroFieldName: `${P3}.Line21[0].p3-cb21[0]` },
    "safe_deposit_location": {
      acroFieldName: `${P3}.Line21[0].p3-t25_21[0]`,
      coordinate: { page: 3, x: 150, y: 615, fontSize: 8, maxWidth: 200 },
    },
    "safe_deposit_contents": {
      acroFieldName: `${P3}.Line21[0].p3-t26_21[0]`,
      coordinate: { page: 3, x: 400, y: 615, fontSize: 8, maxWidth: 150 },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 4: Monthly Income
    // ═══════════════════════════════════════════════════════════════════════════

    "income_wages_taxpayer": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t1_45t[0]`,
      coordinate: { page: 4, x: 350, y: 680, fontSize: 9, maxWidth: 80 },
    },
    "income_wages_spouse": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t2_45s[0]`,
      coordinate: { page: 4, x: 470, y: 680, fontSize: 9, maxWidth: 80 },
    },
    "income_wages": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line45[0].p4-t3_45[0]`,
    },
    "income_ss_taxpayer": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t4_46t[0]`,
      coordinate: { page: 4, x: 350, y: 662, fontSize: 9, maxWidth: 80 },
    },
    "income_ss_spouse": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t5_46s[0]`,
      coordinate: { page: 4, x: 470, y: 662, fontSize: 9, maxWidth: 80 },
    },
    "income_ss": { acroFieldName: `${P4}.TotalMonthlyIncome[0].Line46[0].p4-t6_46[0]` },
    "income_pension_taxpayer": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t7_47t[0]`,
      coordinate: { page: 4, x: 350, y: 644, fontSize: 9, maxWidth: 80 },
    },
    "income_pension_spouse": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t8_47s[0]`,
      coordinate: { page: 4, x: 470, y: 644, fontSize: 9, maxWidth: 80 },
    },
    "income_pension": { acroFieldName: `${P4}.TotalMonthlyIncome[0].Line47[0].p4-t9_47[0]` },
    "income_self_employment": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line48[0].p4-t10_48[0]`,
      coordinate: { page: 4, x: 350, y: 626, fontSize: 9, maxWidth: 80 },
    },
    "income_rental": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line49[0].p4-t11_49[0]`,
      coordinate: { page: 4, x: 350, y: 608, fontSize: 9, maxWidth: 80 },
    },
    "income_interest_dividends": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line50[0].p4-t12_50[0]`,
      coordinate: { page: 4, x: 350, y: 590, fontSize: 9, maxWidth: 80 },
    },
    "income_distributions": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line51[0].p4-t13_51[0]`,
      coordinate: { page: 4, x: 350, y: 572, fontSize: 9, maxWidth: 80 },
    },
    "income_child_support": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line52a[0].p4-t14_52a[0]`,
      coordinate: { page: 4, x: 350, y: 554, fontSize: 9, maxWidth: 80 },
    },
    "income_alimony": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line52b[0].p4-t15_52b[0]`,
      coordinate: { page: 4, x: 350, y: 536, fontSize: 9, maxWidth: 80 },
    },
    "income_other": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line53[0].p4-t16_53[0]`,
      coordinate: { page: 4, x: 350, y: 518, fontSize: 9, maxWidth: 80 },
    },
    "total_monthly_income": {
      acroFieldName: `${P4}.TotalMonthlyIncome[0].Line54[0].p4-t18_54[0]`,
      coordinate: { page: 4, x: 350, y: 500, fontSize: 9, maxWidth: 80 },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 5: Monthly Expenses
    // ═══════════════════════════════════════════════════════════════════════════

    "expense_food_clothing": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line55[0].p5-t1_55[0]`,
      coordinate: { page: 4, x: 350, y: 440, fontSize: 9, maxWidth: 80 },
    },
    "expense_housing": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line56[0].p5-t2_56[0]`,
      coordinate: { page: 4, x: 350, y: 422, fontSize: 9, maxWidth: 80 },
    },
    "expense_vehicle_ownership": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line57[0].p5-t3_57[0]`,
      coordinate: { page: 4, x: 350, y: 404, fontSize: 9, maxWidth: 80 },
    },
    "expense_vehicle_operating": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line58[0].p5-t4_58[0]`,
      coordinate: { page: 4, x: 350, y: 386, fontSize: 9, maxWidth: 80 },
    },
    "expense_public_transit": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line59[0].p5-t5_59[0]`,
      coordinate: { page: 4, x: 350, y: 368, fontSize: 9, maxWidth: 80 },
    },
    "expense_health_insurance": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line60[0].p5-t6_60[0]`,
      coordinate: { page: 5, x: 350, y: 700, fontSize: 9, maxWidth: 80 },
    },
    "expense_medical": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line61[0].p5-t7_61[0]`,
      coordinate: { page: 5, x: 350, y: 682, fontSize: 9, maxWidth: 80 },
    },
    "expense_court_ordered": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line62[0].p5-t8_62[0]`,
      coordinate: { page: 5, x: 350, y: 664, fontSize: 9, maxWidth: 80 },
    },
    "expense_child_care": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line63[0].p5-t9_63[0]`,
      coordinate: { page: 5, x: 350, y: 646, fontSize: 9, maxWidth: 80 },
    },
    "expense_life_insurance": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line64[0].p5-t10_64[0]`,
      coordinate: { page: 5, x: 350, y: 628, fontSize: 9, maxWidth: 80 },
    },
    "expense_taxes": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line65[0].p5-t11_65[0]`,
      coordinate: { page: 5, x: 350, y: 610, fontSize: 9, maxWidth: 80 },
    },
    "expense_secured_debts": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line66[0].p5-t12_66[0]`,
      coordinate: { page: 5, x: 350, y: 592, fontSize: 9, maxWidth: 80 },
    },
    "expense_delinquent_state_taxes": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line67[0].p5-t13_67[0]`,
      coordinate: { page: 5, x: 350, y: 574, fontSize: 9, maxWidth: 80 },
    },
    "expense_other": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line67b[0].p5-t14_67b[0]`,
      coordinate: { page: 5, x: 350, y: 556, fontSize: 9, maxWidth: 80 },
    },
    "total_monthly_expenses": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line68[0].p5-t16_68[0]`,
      coordinate: { page: 5, x: 350, y: 538, fontSize: 9, maxWidth: 80 },
    },
    "remaining_monthly_income": {
      acroFieldName: `${P5}.TotalLivingExpenses[0].Line69[0].p5-t17_69[0]`,
      coordinate: { page: 5, x: 350, y: 520, fontSize: 9, maxWidth: 80 },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 6: Business Information (Self-Employed)
    // ═══════════════════════════════════════════════════════════════════════════

    "business_name_formal": {
      acroFieldName: `${P6}.Line30[0].p6-t1_30[0]`,
      coordinate: { page: 5, x: 62, y: 440, fontSize: 8, maxWidth: 200 },
    },
    "business_address": {
      acroFieldName: `${P6}.Line30[0].p6-t2_30[0]`,
      coordinate: { page: 5, x: 62, y: 425, fontSize: 8, maxWidth: 300 },
    },
    "business_phone": {
      acroFieldName: `${P6}.Line30[0].p6-t3_30[0]`,
      coordinate: { page: 5, x: 400, y: 525, fontSize: 8, maxWidth: 150 },
    },
    "business_ein_formal": {
      acroFieldName: `${P6}.Line30[0].p6-t4_30[0]`,
      coordinate: { page: 5, x: 300, y: 440, fontSize: 8, maxWidth: 100 },
    },
    "business_type_formal": {
      acroFieldName: `${P6}.Line30[0].p6-t5_30[0]`,
      coordinate: { page: 5, x: 420, y: 440, fontSize: 8, maxWidth: 140 },
    },
    "business_start_date": {
      acroFieldName: `${P6}.Line30[0].p6-t6_30[0]`,
      coordinate: { page: 5, x: 62, y: 425, fontSize: 8, maxWidth: 100 },
    },
    "number_employees": {
      acroFieldName: `${P6}.Line30[0].p6-t7_30[0]`,
      coordinate: { page: 5, x: 200, y: 425, fontSize: 8, maxWidth: 60 },
    },
    "business_website": {
      acroFieldName: `${P6}.Line30[0].p6-t8_30[0]`,
      coordinate: { page: 5, x: 300, y: 425, fontSize: 8, maxWidth: 250 },
    },

    // Business bank accounts
    "business_bank_accounts.0.bba_bank_name": {
      acroFieldName: `${P6}.Table_Line31[0].Row31a[0].p6-t9_31a[0]`,
      coordinate: { page: 5, x: 62, y: 390, fontSize: 8, maxWidth: 160 },
    },
    "business_bank_accounts.0.bba_account_type": {
      acroFieldName: `${P6}.Table_Line31[0].Row31a[0].p6-t10_31a[0]`,
      coordinate: { page: 5, x: 240, y: 390, fontSize: 8, maxWidth: 80 },
    },
    "business_bank_accounts.0.bba_balance": {
      acroFieldName: `${P6}.Table_Line31[0].Row31a[0].p6-t11_31a[0]`,
      coordinate: { page: 5, x: 400, y: 390, fontSize: 8, maxWidth: 80 },
    },
    "business_bank_accounts.1.bba_bank_name": {
      acroFieldName: `${P6}.Table_Line31[0].Row31b[0].p6-t9_31b[0]`,
      coordinate: { page: 5, x: 62, y: 376, fontSize: 8, maxWidth: 160 },
    },
    "business_bank_accounts.1.bba_account_type": {
      acroFieldName: `${P6}.Table_Line31[0].Row31b[0].p6-t10_31b[0]`,
      coordinate: { page: 5, x: 240, y: 376, fontSize: 8, maxWidth: 80 },
    },
    "business_bank_accounts.1.bba_balance": {
      acroFieldName: `${P6}.Table_Line31[0].Row31b[0].p6-t11_31b[0]`,
      coordinate: { page: 5, x: 400, y: 376, fontSize: 8, maxWidth: 80 },
    },
  },
}
