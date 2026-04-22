/**
 * Flatten repeating-group values into dot-notation keys.
 *
 * FormInstance.values stores repeating groups as nested arrays:
 *
 *   {
 *     taxpayer_name: "Jane Doe",
 *     bank_accounts: [
 *       { bank_name: "Chase", balance: 2400 },
 *       { bank_name: "Ally",  balance: 850  },
 *     ]
 *   }
 *
 * PDF bindings reference them flat:
 *
 *   bank_accounts.0.bank_name, bank_accounts.0.balance,
 *   bank_accounts.1.bank_name, bank_accounts.1.balance
 *
 * This helper walks the values object and produces the flat form.
 * Non-array values pass through unchanged.
 *
 * Does not recurse into nested groups-within-groups (the form builder's
 * data model doesn't use those — every repeating group is a single level).
 */
export function flattenValues(values: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val)) {
      val.forEach((entry, idx) => {
        if (entry && typeof entry === "object") {
          for (const [subKey, subVal] of Object.entries(entry)) {
            out[`${key}.${idx}.${subKey}`] = subVal
          }
        }
      })
    } else {
      out[key] = val
    }
  }
  return out
}
