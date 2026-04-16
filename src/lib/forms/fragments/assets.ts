import type { FieldDef } from "../types"

// IRS Form 656 (Offer in Compromise) Quick Sale Value (QSV) discount.
// Per the IRS OIC instructions, QSV is typically 80% of FMV — this reflects
// what a forced/quick sale would actually realize. The QSV equity (QSV minus
// encumbrance) is what flows into the RCP calculation.
const QSV_DISCOUNT = 0.8

export const VEHICLES_GROUP: FieldDef = {
  id: "vehicles",
  label: "Vehicles",
  type: "repeating_group",
  irsReference: "Line 18",
  minGroups: 0,
  maxGroups: 5,
  groupFields: [
    { id: "veh_year", label: "Year", type: "text", required: true },
    { id: "veh_make", label: "Make", type: "text", required: true },
    { id: "veh_model", label: "Model", type: "text", required: true },
    { id: "veh_mileage", label: "Mileage", type: "text" },
    { id: "veh_fmv", label: "Fair Market Value", type: "currency" },
    { id: "veh_loan", label: "Loan Balance", type: "currency" },
    { id: "veh_equity", label: "Equity (FMV - Loan)", type: "computed", computeFormula: "veh_fmv - veh_loan", dependsOn: ["veh_fmv", "veh_loan"], helpText: "Standard equity used for collection statements." },
    { id: "veh_qsv", label: "Quick Sale Value (80% FMV)", type: "computed", computeFormula: `veh_fmv * ${QSV_DISCOUNT}`, dependsOn: ["veh_fmv"], helpText: "IRS-discounted value for OIC calculations." },
    { id: "veh_qsv_equity", label: "QSV Equity (QSV - Loan)", type: "computed", computeFormula: `veh_fmv * ${QSV_DISCOUNT} - veh_loan`, dependsOn: ["veh_fmv", "veh_loan"], helpText: "Quick-sale equity — what flows into OIC RCP." },
    { id: "veh_monthly_payment", label: "Monthly Payment", type: "currency" },
    { id: "veh_lender", label: "Lender", type: "text" },
  ],
}

export const REAL_PROPERTY_GROUP: FieldDef = {
  id: "real_property",
  label: "Real Property",
  type: "repeating_group",
  irsReference: "Line 16",
  minGroups: 0,
  maxGroups: 5,
  groupFields: [
    { id: "prop_description", label: "Property Description", type: "text", required: true },
    { id: "prop_address", label: "Property Address", type: "text" },
    { id: "prop_fmv", label: "Fair Market Value", type: "currency" },
    { id: "prop_loan", label: "Loan Balance", type: "currency" },
    { id: "prop_equity", label: "Equity (FMV - Loan)", type: "computed", computeFormula: "prop_fmv - prop_loan", dependsOn: ["prop_fmv", "prop_loan"], helpText: "Standard equity used for collection statements." },
    { id: "prop_qsv", label: "Quick Sale Value (80% FMV)", type: "computed", computeFormula: `prop_fmv * ${QSV_DISCOUNT}`, dependsOn: ["prop_fmv"], helpText: "IRS-discounted value for OIC calculations." },
    { id: "prop_qsv_equity", label: "QSV Equity (QSV - Loan)", type: "computed", computeFormula: `prop_fmv * ${QSV_DISCOUNT} - prop_loan`, dependsOn: ["prop_fmv", "prop_loan"], helpText: "Quick-sale equity — what flows into OIC RCP." },
    { id: "prop_monthly_payment", label: "Monthly Payment", type: "currency" },
    { id: "prop_lender", label: "Lender", type: "text" },
  ],
}

export const INVESTMENTS_GROUP: FieldDef = {
  id: "investments",
  label: "Investments",
  type: "repeating_group",
  irsReference: "Line 14",
  minGroups: 0,
  maxGroups: 10,
  groupFields: [
    { id: "inv_institution", label: "Institution", type: "text", required: true },
    {
      id: "inv_type",
      label: "Type",
      type: "single_select",
      options: [
        { value: "brokerage", label: "Brokerage" },
        { value: "mutual_fund", label: "Mutual Fund" },
        { value: "stocks", label: "Stocks/Bonds" },
        { value: "other", label: "Other" },
      ],
    },
    { id: "inv_balance", label: "Current Value", type: "currency" },
    { id: "inv_loan", label: "Loan Balance", type: "currency" },
  ],
}

export const RETIREMENT_GROUP: FieldDef = {
  id: "retirement_accounts",
  label: "Retirement Accounts",
  type: "repeating_group",
  irsReference: "Line 17",
  minGroups: 0,
  maxGroups: 10,
  groupFields: [
    { id: "ret_institution", label: "Institution", type: "text", required: true },
    {
      id: "ret_type",
      label: "Type",
      type: "single_select",
      options: [
        { value: "401k", label: "401(k)" },
        { value: "ira", label: "Traditional IRA" },
        { value: "roth", label: "Roth IRA" },
        { value: "pension", label: "Pension" },
        { value: "other", label: "Other" },
      ],
    },
    { id: "ret_balance", label: "Current Value", type: "currency" },
    { id: "ret_loan", label: "Loan Balance", type: "currency" },
  ],
}
