import type { FieldDef } from "../types"

export const DEPENDENTS_GROUP: FieldDef = {
  id: "dependents",
  label: "Dependents",
  type: "repeating_group",
  irsReference: "Line 6",
  minGroups: 0,
  maxGroups: 10,
  groupFields: [
    { id: "dep_name", label: "Name", type: "text", required: true },
    { id: "dep_dob", label: "Date of Birth", type: "date", required: true },
    {
      id: "dep_relationship",
      label: "Relationship",
      type: "single_select",
      options: [
        { value: "child", label: "Child" },
        { value: "parent", label: "Parent" },
        { value: "other", label: "Other" },
      ],
    },
    { id: "dep_lives_with", label: "Lives with you?", type: "yes_no" },
    { id: "dep_contributes", label: "Contributes to support?", type: "yes_no" },
  ],
}
