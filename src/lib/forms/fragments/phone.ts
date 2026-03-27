import type { FieldDef } from "../types"

export const HOME_PHONE_FIELD: FieldDef = {
  id: "home_phone",
  label: "Home Phone",
  type: "phone",
  irsReference: "Line 3a",
}

export const CELL_PHONE_FIELD: FieldDef = {
  id: "cell_phone",
  label: "Cell Phone",
  type: "phone",
  irsReference: "Line 3b",
}

export const WORK_PHONE_FIELD: FieldDef = {
  id: "work_phone",
  label: "Work Phone",
  type: "phone",
  irsReference: "Line 1f",
}

export const DAYTIME_PHONE_FIELD: FieldDef = {
  id: "daytime_phone",
  label: "Daytime Phone",
  type: "phone",
  irsReference: "Line 4",
}
