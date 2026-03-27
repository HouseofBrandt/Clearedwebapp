import type { FieldDef } from "../types"

export const REPRESENTATIVE_FIELDS: FieldDef[] = [
  {
    id: "rep_name",
    label: "Representative Name",
    type: "text",
    irsReference: "Line 9a",
  },
  {
    id: "rep_caf",
    label: "CAF Number",
    type: "text",
    irsReference: "Line 9c",
  },
  {
    id: "rep_phone",
    label: "Representative Phone",
    type: "phone",
    irsReference: "Line 9b",
  },
  {
    id: "rep_firm_name",
    label: "Firm Name",
    type: "text",
  },
  {
    id: "rep_poa_on_file",
    label: "Power of Attorney on File (Form 2848)?",
    type: "yes_no",
    irsReference: "Line 10",
  },
]
