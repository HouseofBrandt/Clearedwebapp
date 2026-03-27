import type { FieldDef } from "../types"
import { ACCOUNT_TYPES } from "./constants"

export const BANK_ACCOUNTS_GROUP: FieldDef = {
  id: "bank_accounts",
  label: "Bank Accounts",
  type: "repeating_group",
  irsReference: "Line 13",
  minGroups: 0,
  maxGroups: 10,
  groupFields: [
    { id: "bank_name", label: "Bank/Institution Name", type: "text", required: true },
    {
      id: "bank_account_type",
      label: "Account Type",
      type: "single_select",
      options: ACCOUNT_TYPES,
    },
    { id: "bank_balance", label: "Current Balance", type: "currency", required: true },
  ],
}
