// Map Cleared form field IDs to the PDF form field names in the actual IRS PDF.
// These field names are the XFA paths discovered via the /api/forms/pdf-fields endpoint.
//
// Form 433-A (Rev. 7-2022) has 6 pages with ~350+ fields using naming patterns like:
//   topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t4[0]
//
// Naming convention clues:
//   - Page1, Page2, etc. = page number
//   - c1, c2 = column/section containers
//   - Lines1a-b = IRS line reference
//   - p1-t4 = page 1, text field 4
//   - C1_01_2a = checkbox, section 1, question 2a
//   - ClaimedAsDependents, Row1, Row2 = repeating table rows
//   - Table_Part4-Line5 = Part/Section reference

export const PDF_FIELD_MAP: Record<string, Record<string, string>> = {
  "433-A": {
    // ═══════════════════════════════════════════════════════════════════
    // PAGE 1 — Section 1: Personal Information
    // ═══════════════════════════════════════════════════════════════════

    // Line 1a: Taxpayer name
    "taxpayer_name": "topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t4[0]",
    // Line 1b: SSN
    "ssn": "topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t5[0]",
    // Line 1c: Date of birth (taxpayer)
    "dob": "topmostSubform[0].Page1[0].c1[0].Line1c[0].p1-t6c[0]",
    // County
    "county": "topmostSubform[0].Page1[0].c1[0].Line1c[0].p1-t7c[0]",

    // Line 1d: Home phone
    "home_phone": "topmostSubform[0].Page1[0].c1[0].Line1d[0].p1-t8d[0]",
    // Line 1e: Cell phone
    "cell_phone": "topmostSubform[0].Page1[0].c1[0].Line1d[0].p1-t9d[0]",
    // Line 1f: Work phone
    "work_phone": "topmostSubform[0].Page1[0].c1[0].Line1e[0].p1-t10e[0]",

    // Line 2a: Address — street
    "address_street": "topmostSubform[0].Page1[0].c1[0].Line2a[0].p1-t11[0]",
    // Line 2a: Address — city
    "address_city": "topmostSubform[0].Page1[0].c1[0].Line2a[0].p1-t12[0]",
    // Line 2a: Address — state
    "address_state": "topmostSubform[0].Page1[0].c1[0].Line2a[0].p1-t13[0]",
    // Line 2a: Address — zip
    "address_zip": "topmostSubform[0].Page1[0].c1[0].Line2a[0].p1-t14[0]",

    // Line 4: Marital status checkboxes
    // Checkbox 1 = Married
    "marital_status_married": "topmostSubform[0].Page1[0].c1[0].C1_01_2a[0]",
    // Checkbox 2 = Unmarried
    "marital_status_unmarried": "topmostSubform[0].Page1[0].c1[0].C1_01_2a[1]",

    // Line 5a: Spouse name
    "spouse_name": "topmostSubform[0].Page1[0].c1[0].Lines1a-b[1].p1-t4[0]",
    // Line 5b: Spouse SSN
    "spouse_ssn": "topmostSubform[0].Page1[0].c1[0].Lines1a-b[1].p1-t5[0]",
    // Line 5c: Spouse DOB
    "spouse_dob": "topmostSubform[0].Page1[0].c1[0].Line1c[1].p1-t6c[0]",

    // ── Dependents (Line 6 table) ──
    // Row 1
    "dependents.0.dep_name": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row1[0].Name[0]",
    "dependents.0.dep_relationship": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row1[0].Relationship[0]",
    "dependents.0.dep_dob": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row1[0].DateOfBirth[0]",
    "dependents.0.dep_lives_with": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row1[0].LivesWithYou[0]",
    "dependents.0.dep_contributes": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row1[0].Contributes[0]",
    // Row 2
    "dependents.1.dep_name": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row2[0].Name[0]",
    "dependents.1.dep_relationship": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row2[0].Relationship[0]",
    "dependents.1.dep_dob": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row2[0].DateOfBirth[0]",
    "dependents.1.dep_lives_with": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row2[0].LivesWithYou[0]",
    "dependents.1.dep_contributes": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row2[0].Contributes[0]",
    // Row 3
    "dependents.2.dep_name": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row3[0].Name[0]",
    "dependents.2.dep_relationship": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row3[0].Relationship[0]",
    "dependents.2.dep_dob": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row3[0].DateOfBirth[0]",
    "dependents.2.dep_lives_with": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row3[0].LivesWithYou[0]",
    "dependents.2.dep_contributes": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row3[0].Contributes[0]",
    // Row 4
    "dependents.3.dep_name": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row4[0].Name[0]",
    "dependents.3.dep_relationship": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row4[0].Relationship[0]",
    "dependents.3.dep_dob": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row4[0].DateOfBirth[0]",
    "dependents.3.dep_lives_with": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row4[0].LivesWithYou[0]",
    "dependents.3.dep_contributes": "topmostSubform[0].Page1[0].c2[0].ClaimedAsDependents[0].Row4[0].Contributes[0]",

    // Line 7: Employment type (single_select — we use a text field on the PDF)
    // Not directly mappable to a text field; the PDF likely uses checkboxes for employment type

    // Line 8: Lived outside US
    "lived_outside_us": "topmostSubform[0].Page1[0].c2[0].C1_01_8[0]",
    "outside_us_details": "topmostSubform[0].Page1[0].c2[0].Line8[0].p1-t8[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 2 — Section 2: Employment Information
    // ═══════════════════════════════════════════════════════════════════

    // Employer 1 (Lines 8-12 on IRS form)
    "employers.0.emp_name": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].Name[0]",
    "employers.0.emp_address": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].Address[0]",
    "employers.0.emp_phone": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].Phone[0]",
    "employers.0.emp_hire_date": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].HireDate[0]",
    "employers.0.emp_gross_monthly": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].GrossMonthly[0]",
    "employers.0.emp_net_monthly": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row1[0].NetMonthly[0]",

    // Spouse employer
    "employers.1.emp_name": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].Name[0]",
    "employers.1.emp_address": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].Address[0]",
    "employers.1.emp_phone": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].Phone[0]",
    "employers.1.emp_hire_date": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].HireDate[0]",
    "employers.1.emp_gross_monthly": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].GrossMonthly[0]",
    "employers.1.emp_net_monthly": "topmostSubform[0].Page2[0].c1[0].EmployerInfo[0].Row2[0].NetMonthly[0]",

    // Self-employment / business info (Line 13)
    "business_name": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t1[0]",
    "business_ein": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t2[0]",
    "business_type": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t3[0]",
    "business_address": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t4[0]",
    "business_phone": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t5[0]",
    "business_gross_monthly": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t6[0]",
    "business_expenses_monthly": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t7[0]",
    "business_net_monthly": "topmostSubform[0].Page2[0].c1[0].Line13[0].p2-t8[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 3 — Section 3: Personal Assets
    // ═══════════════════════════════════════════════════════════════════

    // Line 12: Cash on hand
    "cash_on_hand": "topmostSubform[0].Page3[0].c1[0].Line12[0].p3-t1[0]",

    // Line 14: Bank accounts
    "bank_accounts.0.bank_name": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row1[0].Name[0]",
    "bank_accounts.0.bank_account_type": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row1[0].Type[0]",
    "bank_accounts.0.bank_balance": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row1[0].Balance[0]",
    "bank_accounts.1.bank_name": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row2[0].Name[0]",
    "bank_accounts.1.bank_account_type": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row2[0].Type[0]",
    "bank_accounts.1.bank_balance": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row2[0].Balance[0]",
    "bank_accounts.2.bank_name": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row3[0].Name[0]",
    "bank_accounts.2.bank_account_type": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row3[0].Type[0]",
    "bank_accounts.2.bank_balance": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Row3[0].Balance[0]",
    "total_bank_balances": "topmostSubform[0].Page3[0].c1[0].BankAccounts[0].Total[0]",

    // Line 15: Investments
    "investments.0.inv_institution": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row1[0].Name[0]",
    "investments.0.inv_type": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row1[0].Type[0]",
    "investments.0.inv_balance": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row1[0].Value[0]",
    "investments.0.inv_loan": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row1[0].Loan[0]",
    "investments.0.inv_equity": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row1[0].Equity[0]",
    "investments.1.inv_institution": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row2[0].Name[0]",
    "investments.1.inv_type": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row2[0].Type[0]",
    "investments.1.inv_balance": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row2[0].Value[0]",
    "investments.1.inv_loan": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row2[0].Loan[0]",
    "investments.1.inv_equity": "topmostSubform[0].Page3[0].c1[0].Investments[0].Row2[0].Equity[0]",

    // Line 16: Real property
    "real_property.0.prop_description": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].Description[0]",
    "real_property.0.prop_fmv": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].FMV[0]",
    "real_property.0.prop_loan": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].Loan[0]",
    "real_property.0.prop_equity": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].Equity[0]",
    "real_property.0.prop_monthly_payment": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].Payment[0]",
    "real_property.0.prop_lender": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row1[0].Lender[0]",
    "real_property.1.prop_description": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].Description[0]",
    "real_property.1.prop_fmv": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].FMV[0]",
    "real_property.1.prop_loan": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].Loan[0]",
    "real_property.1.prop_equity": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].Equity[0]",
    "real_property.1.prop_monthly_payment": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].Payment[0]",
    "real_property.1.prop_lender": "topmostSubform[0].Page3[0].c2[0].RealProperty[0].Row2[0].Lender[0]",

    // Line 17: Retirement accounts
    "retirement_accounts.0.ret_institution": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row1[0].Name[0]",
    "retirement_accounts.0.ret_type": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row1[0].Type[0]",
    "retirement_accounts.0.ret_balance": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row1[0].Value[0]",
    "retirement_accounts.0.ret_loan": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row1[0].Loan[0]",
    "retirement_accounts.1.ret_institution": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row2[0].Name[0]",
    "retirement_accounts.1.ret_type": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row2[0].Type[0]",
    "retirement_accounts.1.ret_balance": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row2[0].Value[0]",
    "retirement_accounts.1.ret_loan": "topmostSubform[0].Page3[0].c2[0].Retirement[0].Row2[0].Loan[0]",

    // Line 18: Vehicles
    "vehicles.0.veh_year": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Year[0]",
    "vehicles.0.veh_make": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Make[0]",
    "vehicles.0.veh_model": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Model[0]",
    "vehicles.0.veh_mileage": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Mileage[0]",
    "vehicles.0.veh_fmv": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].FMV[0]",
    "vehicles.0.veh_loan": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Loan[0]",
    "vehicles.0.veh_equity": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Equity[0]",
    "vehicles.0.veh_monthly_payment": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Payment[0]",
    "vehicles.0.veh_lender": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row1[0].Lender[0]",
    "vehicles.1.veh_year": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Year[0]",
    "vehicles.1.veh_make": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Make[0]",
    "vehicles.1.veh_model": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Model[0]",
    "vehicles.1.veh_mileage": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Mileage[0]",
    "vehicles.1.veh_fmv": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].FMV[0]",
    "vehicles.1.veh_loan": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Loan[0]",
    "vehicles.1.veh_equity": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Equity[0]",
    "vehicles.1.veh_monthly_payment": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Payment[0]",
    "vehicles.1.veh_lender": "topmostSubform[0].Page3[0].c2[0].Vehicles[0].Row2[0].Lender[0]",

    // Line 19: Life insurance cash surrender value
    "life_insurance_csv": "topmostSubform[0].Page3[0].c2[0].Line19[0].p3-t19[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 4 — Section 4: Credit cards / Other assets / Financial questions
    // ═══════════════════════════════════════════════════════════════════

    // Available credit / credit cards
    "available_credit.0.cl_institution": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row1[0].Name[0]",
    "available_credit.0.cl_credit_limit": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row1[0].Limit[0]",
    "available_credit.0.cl_amount_owed": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row1[0].Owed[0]",
    "available_credit.0.cl_available_credit": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row1[0].Available[0]",
    "available_credit.1.cl_institution": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row2[0].Name[0]",
    "available_credit.1.cl_credit_limit": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row2[0].Limit[0]",
    "available_credit.1.cl_amount_owed": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row2[0].Owed[0]",
    "available_credit.1.cl_available_credit": "topmostSubform[0].Page4[0].c1[0].CreditLines[0].Row2[0].Available[0]",

    // Other assets (Line 20)
    "other_assets.0.other_description": "topmostSubform[0].Page4[0].c1[0].OtherAssets[0].Row1[0].Description[0]",
    "other_assets.0.other_fmv": "topmostSubform[0].Page4[0].c1[0].OtherAssets[0].Row1[0].Value[0]",
    "other_assets.0.other_loan": "topmostSubform[0].Page4[0].c1[0].OtherAssets[0].Row1[0].Loan[0]",

    // Line 21: Safe deposit box
    "has_safe_deposit": "topmostSubform[0].Page4[0].c1[0].C1_01_21[0]",
    "safe_deposit_location": "topmostSubform[0].Page4[0].c1[0].Line21[0].p4-t1[0]",
    "safe_deposit_contents": "topmostSubform[0].Page4[0].c1[0].Line21[0].p4-t2[0]",

    // Section 6 — Other Financial Information (Lines 22-26)
    "filed_bankruptcy": "topmostSubform[0].Page4[0].c2[0].C1_01_22[0]",
    "bankruptcy_date": "topmostSubform[0].Page4[0].c2[0].Line22[0].p4-t22a[0]",
    "bankruptcy_dismissed": "topmostSubform[0].Page4[0].c2[0].Line22[0].p4-t22b[0]",
    "involved_lawsuit": "topmostSubform[0].Page4[0].c2[0].C1_01_23[0]",
    "lawsuit_details": "topmostSubform[0].Page4[0].c2[0].Line23[0].p4-t23[0]",
    "transferred_assets": "topmostSubform[0].Page4[0].c2[0].C1_01_24[0]",
    "transfer_details": "topmostSubform[0].Page4[0].c2[0].Line24[0].p4-t24[0]",
    "anticipated_income_change": "topmostSubform[0].Page4[0].c2[0].C1_01_25[0]",
    "income_change_details": "topmostSubform[0].Page4[0].c2[0].Line25[0].p4-t25[0]",
    "trust_interest": "topmostSubform[0].Page4[0].c2[0].C1_01_26[0]",
    "trust_details": "topmostSubform[0].Page4[0].c2[0].Line26[0].p4-t26[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 5 — Section 4: Monthly Income (Lines 45-54)
    // ═══════════════════════════════════════════════════════════════════

    // The IRS form has taxpayer column and spouse column for income
    "income_wages_taxpayer": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line45[0].Taxpayer[0]",
    "income_wages_spouse": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line45[0].Spouse[0]",
    "income_ss_taxpayer": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line46[0].Taxpayer[0]",
    "income_ss_spouse": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line46[0].Spouse[0]",
    "income_pension_taxpayer": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line47[0].Taxpayer[0]",
    "income_pension_spouse": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line47[0].Spouse[0]",
    "income_self_employment": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line48[0].Taxpayer[0]",
    "income_rental": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line49[0].Taxpayer[0]",
    "income_interest_dividends": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line50[0].Taxpayer[0]",
    "income_distributions": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line51[0].Taxpayer[0]",
    "income_child_support": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line52a[0].Taxpayer[0]",
    "income_alimony": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line52b[0].Taxpayer[0]",
    "income_other": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line53[0].Taxpayer[0]",
    "total_monthly_income": "topmostSubform[0].Page5[0].c1[0].Table_Part4-Line54[0].Taxpayer[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 5/6 — Section 5: Monthly Expenses (Lines 55-69)
    // ═══════════════════════════════════════════════════════════════════

    "expense_food_clothing": "topmostSubform[0].Page5[0].c2[0].Table_Part5-Line55[0].Amount[0]",
    "expense_housing": "topmostSubform[0].Page5[0].c2[0].Table_Part5-Line56[0].Amount[0]",
    "expense_vehicle_ownership": "topmostSubform[0].Page5[0].c2[0].Table_Part5-Line57[0].Amount[0]",
    "expense_vehicle_operating": "topmostSubform[0].Page5[0].c2[0].Table_Part5-Line58[0].Amount[0]",
    "expense_public_transit": "topmostSubform[0].Page5[0].c2[0].Table_Part5-Line59[0].Amount[0]",
    "expense_health_insurance": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line60[0].Amount[0]",
    "expense_medical": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line61[0].Amount[0]",
    "expense_court_ordered": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line62[0].Amount[0]",
    "expense_child_care": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line63[0].Amount[0]",
    "expense_life_insurance": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line64[0].Amount[0]",
    "expense_taxes": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line65[0].Amount[0]",
    "expense_secured_debts": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line66[0].Amount[0]",
    "expense_delinquent_state_taxes": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line67[0].Amount[0]",
    "expense_other": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line67[0].Amount[0]",
    "total_monthly_expenses": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line68[0].Amount[0]",
    "remaining_monthly_income": "topmostSubform[0].Page6[0].c1[0].Table_Part5-Line69[0].Amount[0]",

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 6 — Section 7: Business Information (self-employed)
    // ═══════════════════════════════════════════════════════════════════

    "business_name_formal": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].Name[0]",
    "business_ein_formal": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].EIN[0]",
    "business_type_formal": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].Type[0]",
    "business_start_date": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].StartDate[0]",
    "number_employees": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].Employees[0]",
    "business_website": "topmostSubform[0].Page6[0].c2[0].BusinessInfo[0].Website[0]",

    // Business bank accounts
    "business_bank_accounts.0.bba_bank_name": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row1[0].Name[0]",
    "business_bank_accounts.0.bba_account_type": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row1[0].Type[0]",
    "business_bank_accounts.0.bba_balance": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row1[0].Balance[0]",
    "business_bank_accounts.1.bba_bank_name": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row2[0].Name[0]",
    "business_bank_accounts.1.bba_account_type": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row2[0].Type[0]",
    "business_bank_accounts.1.bba_balance": "topmostSubform[0].Page6[0].c2[0].BusinessBanks[0].Row2[0].Balance[0]",
  },

  "433-A-OIC": {
    // Section 1: Personal Information
    "taxpayer_name": "topmostSubform[0].Page1[0].Table_Line1[0].Row1[0].TextField1[0]",
    "ssn": "topmostSubform[0].Page1[0].Table_Line1[0].Row1[0].TextField2[0]",
  },

  "12153": {
    // Section 1: Taxpayer Information
    "taxpayer_name": "topmostSubform[0].Page1[0].TextField1[0]",
    "ssn": "topmostSubform[0].Page1[0].TextField2[0]",
    "address_street": "topmostSubform[0].Page1[0].TextField3[0]",
    "address_city": "topmostSubform[0].Page1[0].TextField4[0]",
    "address_state": "topmostSubform[0].Page1[0].TextField5[0]",
    "address_zip": "topmostSubform[0].Page1[0].TextField6[0]",
    "daytime_phone": "topmostSubform[0].Page1[0].TextField7[0]",
  },

  "911": {
    // Section 1: Taxpayer Information
    "taxpayer_name": "topmostSubform[0].Page1[0].TextField1[0]",
    "ssn": "topmostSubform[0].Page1[0].TextField2[0]",
    "address_street": "topmostSubform[0].Page1[0].TextField3[0]",
    "address_city": "topmostSubform[0].Page1[0].TextField4[0]",
    "address_state": "topmostSubform[0].Page1[0].TextField5[0]",
    "address_zip": "topmostSubform[0].Page1[0].TextField6[0]",
  },
}

// Checkbox field IDs — these need form.getCheckBox() instead of getTextField()
// Maps our field ID to { pdfField, trueValue } where trueValue is what triggers check()
export const PDF_CHECKBOX_MAP: Record<string, Record<string, { pdfField: string; checkedWhen: any }>> = {
  "433-A": {
    "marital_status_married": {
      pdfField: "topmostSubform[0].Page1[0].c1[0].C1_01_2a[0]",
      checkedWhen: "married",
    },
    "marital_status_unmarried": {
      pdfField: "topmostSubform[0].Page1[0].c1[0].C1_01_2a[1]",
      checkedWhen: "unmarried", // single, divorced, separated, widowed
    },
    "lived_outside_us": {
      pdfField: "topmostSubform[0].Page1[0].c2[0].C1_01_8[0]",
      checkedWhen: true,
    },
    "has_safe_deposit": {
      pdfField: "topmostSubform[0].Page4[0].c1[0].C1_01_21[0]",
      checkedWhen: true,
    },
    "filed_bankruptcy": {
      pdfField: "topmostSubform[0].Page4[0].c2[0].C1_01_22[0]",
      checkedWhen: true,
    },
    "involved_lawsuit": {
      pdfField: "topmostSubform[0].Page4[0].c2[0].C1_01_23[0]",
      checkedWhen: true,
    },
    "transferred_assets": {
      pdfField: "topmostSubform[0].Page4[0].c2[0].C1_01_24[0]",
      checkedWhen: true,
    },
    "anticipated_income_change": {
      pdfField: "topmostSubform[0].Page4[0].c2[0].C1_01_25[0]",
      checkedWhen: true,
    },
    "trust_interest": {
      pdfField: "topmostSubform[0].Page4[0].c2[0].C1_01_26[0]",
      checkedWhen: true,
    },
  },
}

// Map marital_status select values to which checkbox to check
export const MARITAL_STATUS_CHECKBOX_MAP: Record<string, "married" | "unmarried"> = {
  married: "married",
  single: "unmarried",
  separated: "unmarried",
  divorced: "unmarried",
  widowed: "unmarried",
}
