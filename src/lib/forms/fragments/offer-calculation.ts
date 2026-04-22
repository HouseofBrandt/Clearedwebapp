import type { FieldDef } from "../types"

// Offer-in-Compromise calculation fields used in Form 656.
//
// Cross-form data: when a case's Form 433-A-OIC is complete, these fields
// pre-populate from the RCP calculation on that form. See the
// crossFormMappings declaration on Form 656's schema.

export const OFFER_CALCULATION_FIELDS: FieldDef[] = [
  {
    id: "offer_type",
    label: "Offer Type",
    type: "single_select",
    required: true,
    options: [
      { value: "lump_sum",   label: "Lump-Sum Cash (paid within 5 months of acceptance)" },
      { value: "periodic",   label: "Periodic Payment (paid in 6–24 months)" },
    ],
    helpText: "Lump-sum requires 20% deposit. Periodic requires first payment with the offer.",
  },
  {
    id: "offer_amount",
    label: "Total Offer Amount",
    type: "currency",
    required: true,
    helpText: "The total amount offered. Must be at least the Reasonable Collection Potential (RCP) from Form 433-A-OIC.",
    validation: [
      { type: "min", value: 0, message: "Offer amount must be non-negative" },
    ],
  },
  {
    id: "offer_minimum_rcp",
    label: "Computed Minimum Offer (RCP)",
    type: "computed",
    computeFormula: "rcp_from_433a_oic",
    dependsOn: ["total_rcp"],
    helpText: "Calculated from the paired 433-A-OIC. Your offer should be at or above this amount.",
  },
  {
    id: "offer_basis",
    label: "Basis for Compromise",
    type: "single_select",
    required: true,
    options: [
      { value: "DATC", label: "Doubt as to Collectibility (DATC)" },
      { value: "DATL", label: "Doubt as to Liability (DATL)" },
      { value: "ETA",  label: "Effective Tax Administration (ETA)" },
    ],
    helpText: "DATC is by far the most common. DATL requires documented dispute about the liability itself. ETA is for exceptional equity cases.",
  },
  {
    id: "offer_source_of_funds",
    label: "Source of Funds",
    type: "textarea",
    required: true,
    helpText: "Where will the offer amount come from? (Savings, family gift, loan against retirement, property sale, etc.)",
  },
  {
    id: "offer_payment_terms",
    label: "Payment Terms (if periodic)",
    type: "textarea",
    helpText: "Monthly amount and schedule. Required only for periodic-payment offers.",
    conditionals: [
      { field: "offer_type", operator: "equals", value: "periodic", action: "show" },
    ],
  },
  {
    id: "offer_low_income_cert",
    label: "Low-Income Certification (waive application fee)",
    type: "yes_no",
    helpText: "Check if taxpayer's household income is at or below 250% of federal poverty guidelines. Waives the $205 fee and the 20% deposit.",
  },
]
