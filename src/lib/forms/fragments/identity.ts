import type { FieldDef } from "../types"

export const TAXPAYER_NAME_FIELD: FieldDef = {
  id: "taxpayer_name",
  label: "Full Name",
  type: "text",
  required: true,
  irsReference: "Line 1a",
  validation: [
    { type: "required", message: "Taxpayer name is required" },
    { type: "max_length", value: 100, message: "Name too long" },
  ],
}

export const SSN_FIELD: FieldDef = {
  id: "ssn",
  label: "Social Security Number",
  type: "ssn",
  required: true,
  irsReference: "Line 1b",
  validation: [
    { type: "required", message: "SSN is required" },
    { type: "pattern", value: "^\\d{3}-?\\d{2}-?\\d{4}$", message: "Invalid SSN format" },
  ],
}

export const DOB_FIELD: FieldDef = {
  id: "dob",
  label: "Date of Birth",
  type: "date",
  required: true,
  irsReference: "Line 1c",
}

export const EIN_FIELD: FieldDef = {
  id: "ein",
  label: "Employer Identification Number",
  type: "ein",
  validation: [
    { type: "pattern", value: "^\\d{2}-?\\d{7}$", message: "Invalid EIN format" },
  ],
}

export const SPOUSE_NAME_FIELD: FieldDef = {
  id: "spouse_name",
  label: "Spouse Full Name",
  type: "text",
  irsReference: "Line 5a",
  conditionals: [
    { field: "marital_status", operator: "equals", value: "married", action: "show" },
  ],
}

export const SPOUSE_SSN_FIELD: FieldDef = {
  id: "spouse_ssn",
  label: "Spouse SSN",
  type: "ssn",
  irsReference: "Line 5b",
  conditionals: [
    { field: "marital_status", operator: "equals", value: "married", action: "show" },
  ],
}

export const SPOUSE_DOB_FIELD: FieldDef = {
  id: "spouse_dob",
  label: "Spouse Date of Birth",
  type: "date",
  irsReference: "Line 5c",
  conditionals: [
    { field: "marital_status", operator: "equals", value: "married", action: "show" },
  ],
}
