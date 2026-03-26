// Map Cleared form field IDs to the PDF form field names in the actual IRS PDF
// These field names can be discovered by reading the PDF's AcroForm fields
// via the /api/forms/pdf-fields?form=433-A endpoint.

export const PDF_FIELD_MAP: Record<string, Record<string, string>> = {
  "433-A": {
    // Section 1: Personal Information
    "taxpayer_name": "topmostSubform[0].Page1[0].Table_Line1a[0].Row1[0].TextField1[0]",
    "ssn": "topmostSubform[0].Page1[0].Table_Line1a[0].Row1[0].TextField2[0]",
    "spouse_name": "topmostSubform[0].Page1[0].Table_Line1a[0].Row2[0].TextField1[0]",
    "spouse_ssn": "topmostSubform[0].Page1[0].Table_Line1a[0].Row2[0].TextField2[0]",
    "address_street": "topmostSubform[0].Page1[0].Table_Line2[0].Row1[0].TextField1[0]",
    "address_city": "topmostSubform[0].Page1[0].Table_Line2[0].Row2[0].TextField1[0]",
    "address_state": "topmostSubform[0].Page1[0].Table_Line2[0].Row2[0].TextField2[0]",
    "address_zip": "topmostSubform[0].Page1[0].Table_Line2[0].Row2[0].TextField3[0]",
    "county": "topmostSubform[0].Page1[0].Table_Line3[0].Row1[0].TextField1[0]",
    "home_phone": "topmostSubform[0].Page1[0].Table_Line4[0].Row1[0].TextField1[0]",
    "cell_phone": "topmostSubform[0].Page1[0].Table_Line4[0].Row1[0].TextField2[0]",
    "dob": "topmostSubform[0].Page1[0].Table_Line5[0].Row1[0].TextField1[0]",
    "spouse_dob": "topmostSubform[0].Page1[0].Table_Line5[0].Row1[0].TextField2[0]",
    "marital_status": "topmostSubform[0].Page1[0].Table_Line6[0].Row1[0].TextField1[0]",

    // Section 2: Employment Information
    "employer_name": "topmostSubform[0].Page1[0].Table_Line7[0].Row1[0].TextField1[0]",
    "employer_address": "topmostSubform[0].Page1[0].Table_Line7[0].Row2[0].TextField1[0]",
    "occupation": "topmostSubform[0].Page1[0].Table_Line8[0].Row1[0].TextField1[0]",
    "years_at_job": "topmostSubform[0].Page1[0].Table_Line8[0].Row1[0].TextField2[0]",
    "employer_phone": "topmostSubform[0].Page1[0].Table_Line8[0].Row1[0].TextField3[0]",

    // Section 3: Other Financial Information
    "dependents_claimed": "topmostSubform[0].Page1[0].Table_Line9[0].Row1[0].TextField1[0]",
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

// For forms where we don't have exact field mappings yet,
// we can still generate a filled preview using coordinate-based text placement.
// Coordinates are in PDF points (72 points per inch), with origin at bottom-left.
export const PDF_TEXT_COORDINATES: Record<
  string,
  { fieldId: string; page: number; x: number; y: number; fontSize: number; maxWidth?: number }[]
> = {
  "433-A": [
    // Page 1 — Section 1: Personal Information
    { fieldId: "taxpayer_name", page: 0, x: 95, y: 665, fontSize: 10, maxWidth: 250 },
    { fieldId: "ssn", page: 0, x: 445, y: 665, fontSize: 10 },
    { fieldId: "spouse_name", page: 0, x: 95, y: 645, fontSize: 10, maxWidth: 250 },
    { fieldId: "spouse_ssn", page: 0, x: 445, y: 645, fontSize: 10 },
    { fieldId: "address_street", page: 0, x: 95, y: 625, fontSize: 9, maxWidth: 350 },
    { fieldId: "address_city", page: 0, x: 95, y: 605, fontSize: 9 },
    { fieldId: "address_state", page: 0, x: 250, y: 605, fontSize: 9 },
    { fieldId: "address_zip", page: 0, x: 350, y: 605, fontSize: 9 },
    { fieldId: "county", page: 0, x: 95, y: 585, fontSize: 9, maxWidth: 200 },
    { fieldId: "home_phone", page: 0, x: 95, y: 565, fontSize: 9 },
    { fieldId: "cell_phone", page: 0, x: 300, y: 565, fontSize: 9 },
    { fieldId: "dob", page: 0, x: 95, y: 545, fontSize: 9 },
    { fieldId: "spouse_dob", page: 0, x: 300, y: 545, fontSize: 9 },
    { fieldId: "marital_status", page: 0, x: 95, y: 525, fontSize: 9, maxWidth: 150 },

    // Employment
    { fieldId: "employer_name", page: 0, x: 95, y: 485, fontSize: 9, maxWidth: 250 },
    { fieldId: "employer_address", page: 0, x: 95, y: 465, fontSize: 9, maxWidth: 350 },
    { fieldId: "occupation", page: 0, x: 95, y: 445, fontSize: 9, maxWidth: 150 },
    { fieldId: "years_at_job", page: 0, x: 300, y: 445, fontSize: 9 },
    { fieldId: "employer_phone", page: 0, x: 420, y: 445, fontSize: 9 },
    { fieldId: "dependents_claimed", page: 0, x: 95, y: 425, fontSize: 9 },

    // Page 2 — Banking & Investments (approximate placements)
    { fieldId: "bank_name_1", page: 1, x: 95, y: 700, fontSize: 9, maxWidth: 200 },
    { fieldId: "bank_address_1", page: 1, x: 95, y: 680, fontSize: 9, maxWidth: 250 },
    { fieldId: "bank_account_type_1", page: 1, x: 400, y: 700, fontSize: 9 },
    { fieldId: "bank_balance_1", page: 1, x: 470, y: 700, fontSize: 9 },

    // Page 3 — Real Property (approximate placements)
    { fieldId: "property_description_1", page: 2, x: 95, y: 700, fontSize: 9, maxWidth: 300 },
    { fieldId: "property_fmv_1", page: 2, x: 420, y: 700, fontSize: 9 },
    { fieldId: "property_loan_balance_1", page: 2, x: 470, y: 700, fontSize: 9 },

    // Page 4 — Monthly Income
    { fieldId: "wages_salary", page: 3, x: 420, y: 650, fontSize: 9 },
    { fieldId: "interest_dividends", page: 3, x: 420, y: 630, fontSize: 9 },
    { fieldId: "net_business_income", page: 3, x: 420, y: 610, fontSize: 9 },
    { fieldId: "rental_income", page: 3, x: 420, y: 590, fontSize: 9 },
    { fieldId: "pension_social_security", page: 3, x: 420, y: 570, fontSize: 9 },
    { fieldId: "other_income", page: 3, x: 420, y: 550, fontSize: 9 },
    { fieldId: "total_income", page: 3, x: 420, y: 520, fontSize: 10 },

    // Page 5 — Monthly Expenses
    { fieldId: "food_clothing", page: 4, x: 420, y: 650, fontSize: 9 },
    { fieldId: "housing_utilities", page: 4, x: 420, y: 630, fontSize: 9 },
    { fieldId: "vehicle_operating_costs", page: 4, x: 420, y: 610, fontSize: 9 },
    { fieldId: "vehicle_lease_payments", page: 4, x: 420, y: 590, fontSize: 9 },
    { fieldId: "public_transportation", page: 4, x: 420, y: 570, fontSize: 9 },
    { fieldId: "health_insurance", page: 4, x: 420, y: 550, fontSize: 9 },
    { fieldId: "out_of_pocket_health", page: 4, x: 420, y: 530, fontSize: 9 },
    { fieldId: "court_ordered_payments", page: 4, x: 420, y: 510, fontSize: 9 },
    { fieldId: "child_dependent_care", page: 4, x: 420, y: 490, fontSize: 9 },
    { fieldId: "life_insurance", page: 4, x: 420, y: 470, fontSize: 9 },
    { fieldId: "taxes_fica", page: 4, x: 420, y: 450, fontSize: 9 },
    { fieldId: "other_expenses", page: 4, x: 420, y: 430, fontSize: 9 },
    { fieldId: "total_expenses", page: 4, x: 420, y: 400, fontSize: 10 },
  ],

  "433-A-OIC": [
    { fieldId: "taxpayer_name", page: 0, x: 95, y: 680, fontSize: 10, maxWidth: 250 },
    { fieldId: "ssn", page: 0, x: 445, y: 680, fontSize: 10 },
    { fieldId: "address_street", page: 0, x: 95, y: 650, fontSize: 9, maxWidth: 350 },
    { fieldId: "address_city", page: 0, x: 95, y: 630, fontSize: 9 },
    { fieldId: "address_state", page: 0, x: 250, y: 630, fontSize: 9 },
    { fieldId: "address_zip", page: 0, x: 350, y: 630, fontSize: 9 },
  ],

  "12153": [
    { fieldId: "taxpayer_name", page: 0, x: 95, y: 680, fontSize: 10, maxWidth: 300 },
    { fieldId: "ssn", page: 0, x: 445, y: 680, fontSize: 10 },
    { fieldId: "address_street", page: 0, x: 95, y: 650, fontSize: 9, maxWidth: 350 },
    { fieldId: "address_city", page: 0, x: 95, y: 630, fontSize: 9 },
    { fieldId: "address_state", page: 0, x: 250, y: 630, fontSize: 9 },
    { fieldId: "address_zip", page: 0, x: 350, y: 630, fontSize: 9 },
    { fieldId: "daytime_phone", page: 0, x: 95, y: 610, fontSize: 9 },
  ],

  "911": [
    { fieldId: "taxpayer_name", page: 0, x: 95, y: 680, fontSize: 10, maxWidth: 300 },
    { fieldId: "ssn", page: 0, x: 445, y: 680, fontSize: 10 },
    { fieldId: "address_street", page: 0, x: 95, y: 650, fontSize: 9, maxWidth: 350 },
    { fieldId: "address_city", page: 0, x: 95, y: 630, fontSize: 9 },
    { fieldId: "address_state", page: 0, x: 250, y: 630, fontSize: 9 },
    { fieldId: "address_zip", page: 0, x: 350, y: 630, fontSize: 9 },
  ],
}
