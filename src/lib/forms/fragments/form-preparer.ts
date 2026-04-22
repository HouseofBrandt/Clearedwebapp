import type { FieldDef } from "../types"

// Preparer / representative information block. Used by 2848, 8821, and
// forms that require preparer identification.

export const PREPARER_FIELDS: FieldDef[] = [
  {
    id: "preparer_name",
    label: "Preparer Name",
    type: "text",
    required: true,
    helpText: "The practitioner preparing this form on the taxpayer's behalf.",
  },
  {
    id: "preparer_license_type",
    label: "License Type",
    type: "single_select",
    required: true,
    options: [
      { value: "EA",         label: "Enrolled Agent" },
      { value: "CPA",        label: "Certified Public Accountant" },
      { value: "ATTORNEY",   label: "Attorney" },
      { value: "UNLICENSED", label: "Unlicensed preparer" },
    ],
  },
  {
    id: "preparer_license_number",
    label: "License / PTIN / CAF Number",
    type: "text",
    required: true,
    helpText: "For EA: enrollment number. For CPA: state license. For attorney: bar number. Include CAF if previously assigned.",
  },
  {
    id: "preparer_phone",
    label: "Preparer Phone",
    type: "phone",
    required: true,
  },
  {
    id: "preparer_email",
    label: "Preparer Email",
    type: "text",
    validation: [
      { type: "pattern", value: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message: "Invalid email" },
    ],
  },
  {
    id: "preparer_firm",
    label: "Firm Name",
    type: "text",
    helpText: "If representing on firm letterhead.",
  },
]
