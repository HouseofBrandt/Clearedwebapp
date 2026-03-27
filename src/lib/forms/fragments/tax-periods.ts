import type { FieldDef } from "../types"

export const TAX_PERIODS_GROUP: FieldDef = {
  id: "tax_periods",
  label: "Tax Periods",
  type: "repeating_group",
  irsReference: "Line 8",
  minGroups: 1,
  maxGroups: 20,
  groupFields: [
    { id: "period_year", label: "Tax Year", type: "text", required: true },
    {
      id: "period_tax_type",
      label: "Tax Type",
      type: "single_select",
      options: [
        { value: "1040", label: "1040 (Individual)" },
        { value: "941", label: "941 (Employer Quarterly)" },
        { value: "940", label: "940 (Employer Annual)" },
        { value: "1120", label: "1120 (Corporate)" },
        { value: "1065", label: "1065 (Partnership)" },
        { value: "other", label: "Other" },
      ],
    },
    { id: "period_amount", label: "Amount Owed", type: "currency" },
  ],
}
