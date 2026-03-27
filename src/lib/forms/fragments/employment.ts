import type { FieldDef } from "../types"
import { PAY_FREQUENCIES } from "./constants"

export const EMPLOYMENT_TYPE_FIELD: FieldDef = {
  id: "employment_type",
  label: "Employment Type",
  type: "single_select",
  required: true,
  irsReference: "Line 7",
  options: [
    { value: "wage_earner", label: "Wage Earner (W-2)" },
    { value: "self_employed", label: "Self-Employed" },
    { value: "both", label: "Both" },
    { value: "neither", label: "Neither (Retired/Unemployed)" },
  ],
}

export const EMPLOYERS_GROUP: FieldDef = {
  id: "employers",
  label: "Employers",
  type: "repeating_group",
  irsReference: "Lines 8-12",
  minGroups: 0,
  maxGroups: 5,
  conditionals: [
    { field: "employment_type", operator: "not_equals", value: "self_employed", action: "show" },
  ],
  groupFields: [
    { id: "emp_name", label: "Employer Name", type: "text", required: true },
    { id: "emp_address", label: "Employer Address", type: "text" },
    { id: "emp_phone", label: "Employer Phone", type: "phone" },
    { id: "emp_ein", label: "Employer EIN", type: "ein" },
    { id: "emp_hire_date", label: "Hire Date", type: "date" },
    { id: "emp_gross_monthly", label: "Gross Monthly Pay", type: "currency", required: true },
    { id: "emp_net_monthly", label: "Net Monthly Pay", type: "currency" },
    {
      id: "emp_pay_frequency",
      label: "Pay Frequency",
      type: "single_select",
      options: PAY_FREQUENCIES,
    },
  ],
}

export const SELF_EMPLOYMENT_FIELDS: FieldDef[] = [
  {
    id: "business_name",
    label: "Business Name",
    type: "text",
    irsReference: "Line 13a",
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
  {
    id: "business_ein",
    label: "Business EIN",
    type: "ein",
    irsReference: "Line 13b",
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
  {
    id: "business_type",
    label: "Type of Business",
    type: "text",
    irsReference: "Line 13c",
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
  {
    id: "business_gross_monthly",
    label: "Gross Monthly Business Income",
    type: "currency",
    irsReference: "Line 13d",
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
  {
    id: "business_expenses_monthly",
    label: "Monthly Business Expenses",
    type: "currency",
    irsReference: "Line 13e",
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
  {
    id: "business_net_monthly",
    label: "Net Monthly Business Income",
    type: "computed",
    computeFormula: "business_gross_monthly - business_expenses_monthly",
    dependsOn: ["business_gross_monthly", "business_expenses_monthly"],
    conditionals: [
      { field: "employment_type", operator: "not_equals", value: "wage_earner", action: "show" },
    ],
  },
]
