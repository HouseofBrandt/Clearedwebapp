import type { FieldDef } from "../types"

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
    { id: "veh_equity", label: "Equity", type: "computed", computeFormula: "veh_fmv - veh_loan", dependsOn: ["veh_fmv", "veh_loan"] },
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
    { id: "prop_equity", label: "Equity", type: "computed", computeFormula: "prop_fmv - prop_loan", dependsOn: ["prop_fmv", "prop_loan"] },
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
