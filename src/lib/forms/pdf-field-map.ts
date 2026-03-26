// Coordinate-based PDF field mapping for IRS forms.
//
// IRS Form 433-A (and similar XFA-based forms) cannot be filled via AcroForm APIs
// because pdf-lib strips XFA data on load. Instead, we draw text directly onto
// each page at measured coordinates using page.drawText().
//
// Coordinate system: origin is bottom-left of the page.
// IRS letter-size pages are 612 x 792 points.

export interface PDFFieldCoordinate {
  page: number       // 0-indexed page number
  x: number          // X from left edge in points
  y: number          // Y from bottom edge in points
  fontSize?: number  // Default 9
  maxWidth?: number  // Maximum text width before clipping
  isCheckbox?: boolean // If true, draw "X" when value is truthy
}

export const PDF_COORDINATES: Record<string, Record<string, PDFFieldCoordinate>> = {
  "433-A": {
    // ═══════════════════════════════════════════════════════════════════
    // PAGE 0 (PDF page 1) — Section 1: Personal Information
    // ═══════════════════════════════════════════════════════════════════

    // Line 1a: Full Name of Taxpayer
    "taxpayer_name": { page: 0, x: 150, y: 667, fontSize: 9, maxWidth: 200 },
    // Line 1b: SSN
    "ssn": { page: 0, x: 452, y: 667, fontSize: 9, maxWidth: 110 },

    // Line 1c: Spouse name (if joint)
    "spouse_name": { page: 0, x: 150, y: 649, fontSize: 9, maxWidth: 200 },
    // Line 1c: Spouse SSN
    "spouse_ssn": { page: 0, x: 452, y: 649, fontSize: 9, maxWidth: 110 },

    // Line 2a: Address — street
    "address_street": { page: 0, x: 150, y: 620, fontSize: 9, maxWidth: 250 },
    // Line 2a: Address — city
    "address_city": { page: 0, x: 150, y: 605, fontSize: 9, maxWidth: 150 },
    // Line 2a: Address — state
    "address_state": { page: 0, x: 365, y: 605, fontSize: 9, maxWidth: 40 },
    // Line 2a: Address — zip
    "address_zip": { page: 0, x: 452, y: 605, fontSize: 9, maxWidth: 80 },

    // Line 3: County of Residence
    "county": { page: 0, x: 150, y: 585, fontSize: 9, maxWidth: 160 },

    // Line 3: Date of birth (taxpayer)
    "dob": { page: 0, x: 452, y: 585, fontSize: 9, maxWidth: 80 },
    // Line 3: Spouse DOB
    "spouse_dob": { page: 0, x: 452, y: 570, fontSize: 9, maxWidth: 80 },

    // Line 4: Home phone
    "home_phone": { page: 0, x: 150, y: 555, fontSize: 9, maxWidth: 120 },
    // Line 4: Cell phone
    "cell_phone": { page: 0, x: 330, y: 555, fontSize: 9, maxWidth: 120 },
    // Line 4: Work phone
    "work_phone": { page: 0, x: 485, y: 555, fontSize: 9, maxWidth: 100 },

    // Line 4: Marital status (draw the text value: "Married", "Single", etc.)
    "marital_status": { page: 0, x: 150, y: 530, fontSize: 9, maxWidth: 100 },

    // ── Dependents (Line 6 table) ──
    // Row 1
    "dependents.0.dep_name": { page: 0, x: 62, y: 460, fontSize: 8, maxWidth: 140 },
    "dependents.0.dep_relationship": { page: 0, x: 210, y: 460, fontSize: 8, maxWidth: 80 },
    "dependents.0.dep_dob": { page: 0, x: 310, y: 460, fontSize: 8, maxWidth: 70 },
    "dependents.0.dep_lives_with": { page: 0, x: 400, y: 460, fontSize: 8, maxWidth: 40 },
    "dependents.0.dep_contributes": { page: 0, x: 470, y: 460, fontSize: 8, maxWidth: 40 },
    // Row 2
    "dependents.1.dep_name": { page: 0, x: 62, y: 446, fontSize: 8, maxWidth: 140 },
    "dependents.1.dep_relationship": { page: 0, x: 210, y: 446, fontSize: 8, maxWidth: 80 },
    "dependents.1.dep_dob": { page: 0, x: 310, y: 446, fontSize: 8, maxWidth: 70 },
    "dependents.1.dep_lives_with": { page: 0, x: 400, y: 446, fontSize: 8, maxWidth: 40 },
    "dependents.1.dep_contributes": { page: 0, x: 470, y: 446, fontSize: 8, maxWidth: 40 },
    // Row 3
    "dependents.2.dep_name": { page: 0, x: 62, y: 432, fontSize: 8, maxWidth: 140 },
    "dependents.2.dep_relationship": { page: 0, x: 210, y: 432, fontSize: 8, maxWidth: 80 },
    "dependents.2.dep_dob": { page: 0, x: 310, y: 432, fontSize: 8, maxWidth: 70 },
    "dependents.2.dep_lives_with": { page: 0, x: 400, y: 432, fontSize: 8, maxWidth: 40 },
    "dependents.2.dep_contributes": { page: 0, x: 470, y: 432, fontSize: 8, maxWidth: 40 },
    // Row 4
    "dependents.3.dep_name": { page: 0, x: 62, y: 418, fontSize: 8, maxWidth: 140 },
    "dependents.3.dep_relationship": { page: 0, x: 210, y: 418, fontSize: 8, maxWidth: 80 },
    "dependents.3.dep_dob": { page: 0, x: 310, y: 418, fontSize: 8, maxWidth: 70 },
    "dependents.3.dep_lives_with": { page: 0, x: 400, y: 418, fontSize: 8, maxWidth: 40 },
    "dependents.3.dep_contributes": { page: 0, x: 470, y: 418, fontSize: 8, maxWidth: 40 },

    // Line 8: Lived outside US
    "outside_us_details": { page: 0, x: 150, y: 370, fontSize: 8, maxWidth: 400 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 1 (PDF page 2) — Section 2: Employment Information
    // ═══════════════════════════════════════════════════════════════════

    // Employer 1
    "employers.0.emp_name": { page: 1, x: 62, y: 680, fontSize: 8, maxWidth: 200 },
    "employers.0.emp_address": { page: 1, x: 62, y: 665, fontSize: 8, maxWidth: 300 },
    "employers.0.emp_phone": { page: 1, x: 400, y: 680, fontSize: 8, maxWidth: 150 },
    "employers.0.emp_hire_date": { page: 1, x: 400, y: 665, fontSize: 8, maxWidth: 80 },
    "employers.0.emp_gross_monthly": { page: 1, x: 400, y: 650, fontSize: 8, maxWidth: 80 },
    "employers.0.emp_net_monthly": { page: 1, x: 500, y: 650, fontSize: 8, maxWidth: 80 },

    // Employer 2 (Spouse)
    "employers.1.emp_name": { page: 1, x: 62, y: 620, fontSize: 8, maxWidth: 200 },
    "employers.1.emp_address": { page: 1, x: 62, y: 605, fontSize: 8, maxWidth: 300 },
    "employers.1.emp_phone": { page: 1, x: 400, y: 620, fontSize: 8, maxWidth: 150 },
    "employers.1.emp_hire_date": { page: 1, x: 400, y: 605, fontSize: 8, maxWidth: 80 },
    "employers.1.emp_gross_monthly": { page: 1, x: 400, y: 590, fontSize: 8, maxWidth: 80 },
    "employers.1.emp_net_monthly": { page: 1, x: 500, y: 590, fontSize: 8, maxWidth: 80 },

    // Self-employment / business info (Line 13)
    "business_name": { page: 1, x: 62, y: 540, fontSize: 8, maxWidth: 200 },
    "business_ein": { page: 1, x: 300, y: 540, fontSize: 8, maxWidth: 100 },
    "business_type": { page: 1, x: 420, y: 540, fontSize: 8, maxWidth: 140 },
    "business_address": { page: 1, x: 62, y: 525, fontSize: 8, maxWidth: 300 },
    "business_phone": { page: 1, x: 400, y: 525, fontSize: 8, maxWidth: 150 },
    "business_gross_monthly": { page: 1, x: 400, y: 510, fontSize: 8, maxWidth: 80 },
    "business_expenses_monthly": { page: 1, x: 500, y: 510, fontSize: 8, maxWidth: 80 },
    "business_net_monthly": { page: 1, x: 400, y: 495, fontSize: 8, maxWidth: 80 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 2 (PDF page 3) — Section 3: Personal Assets
    // ═══════════════════════════════════════════════════════════════════

    // Line 12: Cash on hand
    "cash_on_hand": { page: 2, x: 452, y: 700, fontSize: 9, maxWidth: 100 },

    // Line 14: Bank accounts
    "bank_accounts.0.bank_name": { page: 2, x: 62, y: 660, fontSize: 8, maxWidth: 160 },
    "bank_accounts.0.bank_account_type": { page: 2, x: 240, y: 660, fontSize: 8, maxWidth: 80 },
    "bank_accounts.0.bank_balance": { page: 2, x: 452, y: 660, fontSize: 8, maxWidth: 100 },
    "bank_accounts.1.bank_name": { page: 2, x: 62, y: 646, fontSize: 8, maxWidth: 160 },
    "bank_accounts.1.bank_account_type": { page: 2, x: 240, y: 646, fontSize: 8, maxWidth: 80 },
    "bank_accounts.1.bank_balance": { page: 2, x: 452, y: 646, fontSize: 8, maxWidth: 100 },
    "bank_accounts.2.bank_name": { page: 2, x: 62, y: 632, fontSize: 8, maxWidth: 160 },
    "bank_accounts.2.bank_account_type": { page: 2, x: 240, y: 632, fontSize: 8, maxWidth: 80 },
    "bank_accounts.2.bank_balance": { page: 2, x: 452, y: 632, fontSize: 8, maxWidth: 100 },
    "total_bank_balances": { page: 2, x: 452, y: 618, fontSize: 9, maxWidth: 100 },

    // Line 15: Investments
    "investments.0.inv_institution": { page: 2, x: 62, y: 585, fontSize: 8, maxWidth: 140 },
    "investments.0.inv_type": { page: 2, x: 210, y: 585, fontSize: 8, maxWidth: 80 },
    "investments.0.inv_balance": { page: 2, x: 310, y: 585, fontSize: 8, maxWidth: 70 },
    "investments.0.inv_loan": { page: 2, x: 400, y: 585, fontSize: 8, maxWidth: 70 },
    "investments.0.inv_equity": { page: 2, x: 490, y: 585, fontSize: 8, maxWidth: 70 },
    "investments.1.inv_institution": { page: 2, x: 62, y: 571, fontSize: 8, maxWidth: 140 },
    "investments.1.inv_type": { page: 2, x: 210, y: 571, fontSize: 8, maxWidth: 80 },
    "investments.1.inv_balance": { page: 2, x: 310, y: 571, fontSize: 8, maxWidth: 70 },
    "investments.1.inv_loan": { page: 2, x: 400, y: 571, fontSize: 8, maxWidth: 70 },
    "investments.1.inv_equity": { page: 2, x: 490, y: 571, fontSize: 8, maxWidth: 70 },

    // Line 16: Real property
    "real_property.0.prop_description": { page: 2, x: 62, y: 510, fontSize: 8, maxWidth: 140 },
    "real_property.0.prop_fmv": { page: 2, x: 210, y: 510, fontSize: 8, maxWidth: 70 },
    "real_property.0.prop_loan": { page: 2, x: 300, y: 510, fontSize: 8, maxWidth: 70 },
    "real_property.0.prop_equity": { page: 2, x: 390, y: 510, fontSize: 8, maxWidth: 70 },
    "real_property.0.prop_monthly_payment": { page: 2, x: 470, y: 510, fontSize: 8, maxWidth: 60 },
    "real_property.0.prop_lender": { page: 2, x: 62, y: 496, fontSize: 8, maxWidth: 200 },
    "real_property.1.prop_description": { page: 2, x: 62, y: 475, fontSize: 8, maxWidth: 140 },
    "real_property.1.prop_fmv": { page: 2, x: 210, y: 475, fontSize: 8, maxWidth: 70 },
    "real_property.1.prop_loan": { page: 2, x: 300, y: 475, fontSize: 8, maxWidth: 70 },
    "real_property.1.prop_equity": { page: 2, x: 390, y: 475, fontSize: 8, maxWidth: 70 },
    "real_property.1.prop_monthly_payment": { page: 2, x: 470, y: 475, fontSize: 8, maxWidth: 60 },
    "real_property.1.prop_lender": { page: 2, x: 62, y: 461, fontSize: 8, maxWidth: 200 },

    // Line 17: Retirement accounts
    "retirement_accounts.0.ret_institution": { page: 2, x: 62, y: 420, fontSize: 8, maxWidth: 140 },
    "retirement_accounts.0.ret_type": { page: 2, x: 210, y: 420, fontSize: 8, maxWidth: 80 },
    "retirement_accounts.0.ret_balance": { page: 2, x: 310, y: 420, fontSize: 8, maxWidth: 70 },
    "retirement_accounts.0.ret_loan": { page: 2, x: 400, y: 420, fontSize: 8, maxWidth: 70 },
    "retirement_accounts.1.ret_institution": { page: 2, x: 62, y: 406, fontSize: 8, maxWidth: 140 },
    "retirement_accounts.1.ret_type": { page: 2, x: 210, y: 406, fontSize: 8, maxWidth: 80 },
    "retirement_accounts.1.ret_balance": { page: 2, x: 310, y: 406, fontSize: 8, maxWidth: 70 },
    "retirement_accounts.1.ret_loan": { page: 2, x: 400, y: 406, fontSize: 8, maxWidth: 70 },

    // Line 18: Vehicles
    "vehicles.0.veh_year": { page: 2, x: 62, y: 360, fontSize: 8, maxWidth: 40 },
    "vehicles.0.veh_make": { page: 2, x: 110, y: 360, fontSize: 8, maxWidth: 60 },
    "vehicles.0.veh_model": { page: 2, x: 175, y: 360, fontSize: 8, maxWidth: 60 },
    "vehicles.0.veh_mileage": { page: 2, x: 245, y: 360, fontSize: 8, maxWidth: 50 },
    "vehicles.0.veh_fmv": { page: 2, x: 310, y: 360, fontSize: 8, maxWidth: 60 },
    "vehicles.0.veh_loan": { page: 2, x: 380, y: 360, fontSize: 8, maxWidth: 60 },
    "vehicles.0.veh_equity": { page: 2, x: 445, y: 360, fontSize: 8, maxWidth: 50 },
    "vehicles.0.veh_monthly_payment": { page: 2, x: 500, y: 360, fontSize: 8, maxWidth: 50 },
    "vehicles.0.veh_lender": { page: 2, x: 62, y: 346, fontSize: 8, maxWidth: 200 },
    "vehicles.1.veh_year": { page: 2, x: 62, y: 325, fontSize: 8, maxWidth: 40 },
    "vehicles.1.veh_make": { page: 2, x: 110, y: 325, fontSize: 8, maxWidth: 60 },
    "vehicles.1.veh_model": { page: 2, x: 175, y: 325, fontSize: 8, maxWidth: 60 },
    "vehicles.1.veh_mileage": { page: 2, x: 245, y: 325, fontSize: 8, maxWidth: 50 },
    "vehicles.1.veh_fmv": { page: 2, x: 310, y: 325, fontSize: 8, maxWidth: 60 },
    "vehicles.1.veh_loan": { page: 2, x: 380, y: 325, fontSize: 8, maxWidth: 60 },
    "vehicles.1.veh_equity": { page: 2, x: 445, y: 325, fontSize: 8, maxWidth: 50 },
    "vehicles.1.veh_monthly_payment": { page: 2, x: 500, y: 325, fontSize: 8, maxWidth: 50 },
    "vehicles.1.veh_lender": { page: 2, x: 62, y: 311, fontSize: 8, maxWidth: 200 },

    // Line 19: Life insurance cash surrender value
    "life_insurance_csv": { page: 2, x: 452, y: 280, fontSize: 9, maxWidth: 100 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 3 (PDF page 4) — Section 4: Credit cards / Other assets / Financial questions
    // ═══════════════════════════════════════════════════════════════════

    // Available credit / credit cards
    "available_credit.0.cl_institution": { page: 3, x: 62, y: 700, fontSize: 8, maxWidth: 140 },
    "available_credit.0.cl_credit_limit": { page: 3, x: 220, y: 700, fontSize: 8, maxWidth: 80 },
    "available_credit.0.cl_amount_owed": { page: 3, x: 320, y: 700, fontSize: 8, maxWidth: 80 },
    "available_credit.0.cl_available_credit": { page: 3, x: 420, y: 700, fontSize: 8, maxWidth: 80 },
    "available_credit.1.cl_institution": { page: 3, x: 62, y: 686, fontSize: 8, maxWidth: 140 },
    "available_credit.1.cl_credit_limit": { page: 3, x: 220, y: 686, fontSize: 8, maxWidth: 80 },
    "available_credit.1.cl_amount_owed": { page: 3, x: 320, y: 686, fontSize: 8, maxWidth: 80 },
    "available_credit.1.cl_available_credit": { page: 3, x: 420, y: 686, fontSize: 8, maxWidth: 80 },

    // Other assets (Line 20)
    "other_assets.0.other_description": { page: 3, x: 62, y: 650, fontSize: 8, maxWidth: 200 },
    "other_assets.0.other_fmv": { page: 3, x: 310, y: 650, fontSize: 8, maxWidth: 80 },
    "other_assets.0.other_loan": { page: 3, x: 420, y: 650, fontSize: 8, maxWidth: 80 },

    // Line 21: Safe deposit box
    "safe_deposit_location": { page: 3, x: 150, y: 615, fontSize: 8, maxWidth: 200 },
    "safe_deposit_contents": { page: 3, x: 400, y: 615, fontSize: 8, maxWidth: 150 },

    // Section 6 — Other Financial Information (Lines 22-26)
    "bankruptcy_date": { page: 3, x: 150, y: 530, fontSize: 8, maxWidth: 100 },
    "bankruptcy_dismissed": { page: 3, x: 300, y: 530, fontSize: 8, maxWidth: 200 },
    "lawsuit_details": { page: 3, x: 150, y: 500, fontSize: 8, maxWidth: 400 },
    "transfer_details": { page: 3, x: 150, y: 470, fontSize: 8, maxWidth: 400 },
    "income_change_details": { page: 3, x: 150, y: 440, fontSize: 8, maxWidth: 400 },
    "trust_details": { page: 3, x: 150, y: 410, fontSize: 8, maxWidth: 400 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 4 (PDF page 5) — Section 4: Monthly Income (Lines 45-54)
    // ═══════════════════════════════════════════════════════════════════

    "income_wages_taxpayer": { page: 4, x: 350, y: 680, fontSize: 9, maxWidth: 80 },
    "income_wages_spouse": { page: 4, x: 470, y: 680, fontSize: 9, maxWidth: 80 },
    "income_ss_taxpayer": { page: 4, x: 350, y: 662, fontSize: 9, maxWidth: 80 },
    "income_ss_spouse": { page: 4, x: 470, y: 662, fontSize: 9, maxWidth: 80 },
    "income_pension_taxpayer": { page: 4, x: 350, y: 644, fontSize: 9, maxWidth: 80 },
    "income_pension_spouse": { page: 4, x: 470, y: 644, fontSize: 9, maxWidth: 80 },
    "income_self_employment": { page: 4, x: 350, y: 626, fontSize: 9, maxWidth: 80 },
    "income_rental": { page: 4, x: 350, y: 608, fontSize: 9, maxWidth: 80 },
    "income_interest_dividends": { page: 4, x: 350, y: 590, fontSize: 9, maxWidth: 80 },
    "income_distributions": { page: 4, x: 350, y: 572, fontSize: 9, maxWidth: 80 },
    "income_child_support": { page: 4, x: 350, y: 554, fontSize: 9, maxWidth: 80 },
    "income_alimony": { page: 4, x: 350, y: 536, fontSize: 9, maxWidth: 80 },
    "income_other": { page: 4, x: 350, y: 518, fontSize: 9, maxWidth: 80 },
    "total_monthly_income": { page: 4, x: 350, y: 500, fontSize: 9, maxWidth: 80 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 4/5 (PDF pages 5-6) — Section 5: Monthly Expenses (Lines 55-69)
    // ═══════════════════════════════════════════════════════════════════

    "expense_food_clothing": { page: 4, x: 350, y: 440, fontSize: 9, maxWidth: 80 },
    "expense_housing": { page: 4, x: 350, y: 422, fontSize: 9, maxWidth: 80 },
    "expense_vehicle_ownership": { page: 4, x: 350, y: 404, fontSize: 9, maxWidth: 80 },
    "expense_vehicle_operating": { page: 4, x: 350, y: 386, fontSize: 9, maxWidth: 80 },
    "expense_public_transit": { page: 4, x: 350, y: 368, fontSize: 9, maxWidth: 80 },
    "expense_health_insurance": { page: 5, x: 350, y: 700, fontSize: 9, maxWidth: 80 },
    "expense_medical": { page: 5, x: 350, y: 682, fontSize: 9, maxWidth: 80 },
    "expense_court_ordered": { page: 5, x: 350, y: 664, fontSize: 9, maxWidth: 80 },
    "expense_child_care": { page: 5, x: 350, y: 646, fontSize: 9, maxWidth: 80 },
    "expense_life_insurance": { page: 5, x: 350, y: 628, fontSize: 9, maxWidth: 80 },
    "expense_taxes": { page: 5, x: 350, y: 610, fontSize: 9, maxWidth: 80 },
    "expense_secured_debts": { page: 5, x: 350, y: 592, fontSize: 9, maxWidth: 80 },
    "expense_delinquent_state_taxes": { page: 5, x: 350, y: 574, fontSize: 9, maxWidth: 80 },
    "expense_other": { page: 5, x: 350, y: 556, fontSize: 9, maxWidth: 80 },
    "total_monthly_expenses": { page: 5, x: 350, y: 538, fontSize: 9, maxWidth: 80 },
    "remaining_monthly_income": { page: 5, x: 350, y: 520, fontSize: 9, maxWidth: 80 },

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 5 (PDF page 6) — Section 7: Business Information (self-employed)
    // ═══════════════════════════════════════════════════════════════════

    "business_name_formal": { page: 5, x: 62, y: 440, fontSize: 8, maxWidth: 200 },
    "business_ein_formal": { page: 5, x: 300, y: 440, fontSize: 8, maxWidth: 100 },
    "business_type_formal": { page: 5, x: 420, y: 440, fontSize: 8, maxWidth: 140 },
    "business_start_date": { page: 5, x: 62, y: 425, fontSize: 8, maxWidth: 100 },
    "number_employees": { page: 5, x: 200, y: 425, fontSize: 8, maxWidth: 60 },
    "business_website": { page: 5, x: 300, y: 425, fontSize: 8, maxWidth: 250 },

    // Business bank accounts
    "business_bank_accounts.0.bba_bank_name": { page: 5, x: 62, y: 390, fontSize: 8, maxWidth: 160 },
    "business_bank_accounts.0.bba_account_type": { page: 5, x: 240, y: 390, fontSize: 8, maxWidth: 80 },
    "business_bank_accounts.0.bba_balance": { page: 5, x: 400, y: 390, fontSize: 8, maxWidth: 80 },
    "business_bank_accounts.1.bba_bank_name": { page: 5, x: 62, y: 376, fontSize: 8, maxWidth: 160 },
    "business_bank_accounts.1.bba_account_type": { page: 5, x: 240, y: 376, fontSize: 8, maxWidth: 80 },
    "business_bank_accounts.1.bba_balance": { page: 5, x: 400, y: 376, fontSize: 8, maxWidth: 80 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Other forms — minimal coordinate maps (just Page 1 header fields)
  // ═══════════════════════════════════════════════════════════════════

  "433-A-OIC": {
    "taxpayer_name": { page: 0, x: 150, y: 667, fontSize: 9, maxWidth: 200 },
    "ssn": { page: 0, x: 452, y: 667, fontSize: 9, maxWidth: 110 },
  },

  "12153": {
    "taxpayer_name": { page: 0, x: 150, y: 700, fontSize: 9, maxWidth: 200 },
    "ssn": { page: 0, x: 452, y: 700, fontSize: 9, maxWidth: 110 },
    "address_street": { page: 0, x: 150, y: 680, fontSize: 9, maxWidth: 300 },
    "address_city": { page: 0, x: 150, y: 665, fontSize: 9, maxWidth: 150 },
    "address_state": { page: 0, x: 365, y: 665, fontSize: 9, maxWidth: 40 },
    "address_zip": { page: 0, x: 452, y: 665, fontSize: 9, maxWidth: 80 },
    "daytime_phone": { page: 0, x: 150, y: 645, fontSize: 9, maxWidth: 120 },
  },

  "911": {
    "taxpayer_name": { page: 0, x: 150, y: 700, fontSize: 9, maxWidth: 200 },
    "ssn": { page: 0, x: 452, y: 700, fontSize: 9, maxWidth: 110 },
    "address_street": { page: 0, x: 150, y: 680, fontSize: 9, maxWidth: 300 },
    "address_city": { page: 0, x: 150, y: 665, fontSize: 9, maxWidth: 150 },
    "address_state": { page: 0, x: 365, y: 665, fontSize: 9, maxWidth: 40 },
    "address_zip": { page: 0, x: 452, y: 665, fontSize: 9, maxWidth: 80 },
  },
}

// Map marital_status select values to display text
export const MARITAL_STATUS_DISPLAY: Record<string, string> = {
  married: "Married",
  single: "Single",
  separated: "Separated",
  divorced: "Divorced",
  widowed: "Widowed",
}
