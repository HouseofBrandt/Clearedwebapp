import type { FieldDef } from "../types"
import { US_STATES } from "./constants"

export const US_ADDRESS_FIELDS: FieldDef[] = [
  {
    id: "address_street",
    label: "Street Address",
    type: "text",
    required: true,
    irsReference: "Line 2a",
  },
  {
    id: "address_city",
    label: "City",
    type: "text",
    required: true,
  },
  {
    id: "address_state",
    label: "State",
    type: "single_select",
    required: true,
    options: US_STATES,
  },
  {
    id: "address_zip",
    label: "ZIP Code",
    type: "text",
    required: true,
    validation: [
      { type: "pattern", value: "^\\d{5}(-\\d{4})?$", message: "Invalid ZIP" },
    ],
  },
  {
    id: "county",
    label: "County",
    type: "text",
    helpText: "Used for IRS Allowable Living Expense standards lookup",
  },
]
