import { FormSchema } from "../types"
import { FORM_433A } from "./form-433a"

// Reuse sections 1–6 from the base 433-A and add OIC-specific sections 7 & 8
const baseSections = FORM_433A.sections.map((s) => ({
  ...s,
  fields: s.fields.map(f => ({ ...f })),
}))

export const FORM_433A_OIC: FormSchema = {
  formNumber: "433-A-OIC",
  formTitle:
    "Collection Information Statement for Wage Earners and Self-Employed Individuals (Offer in Compromise)",
  revisionDate: "April 2023",
  ombNumber: "1545-0074",
  totalSections: 8,
  estimatedMinutes: 60,
  resolutionMetadata: {
    resolutionPaths: ["oic"],
    requirementLevel: { oic: "required" },
    dependsOn: ["2848"],
    requiredBy: ["656"],
    dataSources: ["433-A"],
    dataTargets: ["656"],
  },
  sections: [
    ...baseSections,

    // ── Section 7: OIC Computation Worksheet ────────────────────────────
    {
      id: "oic_computation",
      title: "OIC Computation Worksheet",
      description:
        "Reasonable Collection Potential (RCP) calculation for the Offer in Compromise",
      irsInstructions:
        "Complete this worksheet to determine the minimum offer amount based on your assets and future income.",
      order: 7,
      fields: [
        {
          id: "offer_type",
          label: "Offer Payment Type",
          type: "single_select",
          required: true,
          helpText:
            "Lump Sum Cash: pay within 5 months of acceptance. Periodic Payment: pay over 6–24 months.",
          options: [
            { value: "lump_sum", label: "Lump Sum Cash" },
            { value: "periodic", label: "Periodic Payment" },
          ],
        },
        {
          id: "total_asset_equity",
          label: "Total Equity in Assets (Quick Sale Value)",
          type: "computed",
          computeFormula:
            "total_bank_balances + SUM(investments.inv_equity) + SUM(real_property.prop_equity) + SUM(vehicles.veh_equity) + life_insurance_csv",
          dependsOn: [
            "total_bank_balances",
            "investments",
            "real_property",
            "vehicles",
            "life_insurance_csv",
          ],
          helpText:
            "Sum of quick-sale values (typically 80% of FMV) for all assets minus encumbrances.",
          irsReference: "OIC Worksheet, Line 1",
        },
        {
          id: "monthly_remaining_income",
          label: "Monthly Remaining Income",
          type: "computed",
          computeFormula: "total_monthly_income - total_monthly_expenses",
          dependsOn: ["total_monthly_income", "total_monthly_expenses"],
          helpText: "Net disposable income from Section 4 minus Section 5.",
          irsReference: "OIC Worksheet, Line 2",
        },
        {
          id: "future_income_lump",
          label: "Future Income (Lump Sum — 12 months)",
          type: "computed",
          computeFormula: "monthly_remaining_income * 12",
          dependsOn: ["monthly_remaining_income"],
          helpText:
            "Monthly remaining income × 12 months (used for lump-sum offers).",
          irsReference: "OIC Worksheet, Line 3a",
        },
        {
          id: "future_income_periodic",
          label: "Future Income (Periodic — 24 months)",
          type: "computed",
          computeFormula: "monthly_remaining_income * 24",
          dependsOn: ["monthly_remaining_income"],
          helpText:
            "Monthly remaining income × 24 months (used for periodic payment offers).",
          irsReference: "OIC Worksheet, Line 3b",
        },
        {
          id: "rcp_lump",
          label: "RCP — Lump Sum Offer",
          type: "computed",
          computeFormula: "total_asset_equity + future_income_lump",
          dependsOn: ["total_asset_equity", "future_income_lump"],
          helpText:
            "Reasonable Collection Potential for a lump-sum cash offer.",
          irsReference: "OIC Worksheet, Line 4a",
        },
        {
          id: "rcp_periodic",
          label: "RCP — Periodic Payment Offer",
          type: "computed",
          computeFormula: "total_asset_equity + future_income_periodic",
          dependsOn: ["total_asset_equity", "future_income_periodic"],
          helpText:
            "Reasonable Collection Potential for a periodic payment offer.",
          irsReference: "OIC Worksheet, Line 4b",
        },
        {
          id: "total_liability",
          label: "Total Tax Liability (Assessed Balance)",
          type: "currency",
          required: true,
          helpText:
            "Total assessed balance owed to the IRS including penalties and interest.",
          irsReference: "OIC Worksheet, Line 5",
        },
        {
          id: "offer_amount",
          label: "Proposed Offer Amount",
          type: "currency",
          required: true,
          helpText:
            "The dollar amount you propose to pay to resolve the tax liability. Must meet or exceed the applicable RCP.",
          irsReference: "OIC Worksheet, Line 6",
        },
        {
          id: "offer_justification",
          label: "Offer Justification / Basis",
          type: "textarea",
          required: true,
          helpText:
            "Explain the basis for the offer: doubt as to collectibility, effective tax administration, or doubt as to liability.",
          placeholder:
            "Describe why the proposed offer amount is appropriate and which OIC basis applies...",
        },
      ],
    },

    // ── Section 8: Special Circumstances ────────────────────────────────
    {
      id: "special_circumstances",
      title: "Special Circumstances",
      description:
        "OIC basis selection, hardship factors, and special circumstances narrative",
      irsInstructions:
        "Provide a thorough explanation of any special circumstances that support the offer.",
      order: 8,
      fields: [
        {
          id: "oic_basis",
          label: "OIC Basis",
          type: "single_select",
          required: true,
          helpText:
            "The legal basis for your Offer in Compromise under IRC § 7122.",
          options: [
            {
              value: "doubt_collectibility",
              label: "Doubt as to Collectibility",
            },
            {
              value: "effective_tax_admin",
              label: "Effective Tax Administration",
            },
            { value: "doubt_liability", label: "Doubt as to Liability" },
          ],
        },
        {
          id: "special_circumstances_narrative",
          label: "Special Circumstances Narrative",
          type: "textarea",
          required: true,
          helpText:
            "Provide a detailed explanation of the taxpayer's circumstances supporting the OIC.",
          placeholder:
            "Describe in detail the financial hardship, health issues, or other factors that make full payment impossible or inequitable...",
        },
        {
          id: "hardship_factors",
          label: "Hardship Factors",
          type: "multi_select",
          helpText: "Select all applicable hardship factors.",
          options: [
            { value: "health_issues", label: "Health Issues" },
            { value: "age", label: "Advanced Age" },
            { value: "disability", label: "Disability" },
            { value: "income_decline", label: "Significant Income Decline" },
            { value: "natural_disaster", label: "Natural Disaster" },
            { value: "other", label: "Other" },
          ],
        },
        {
          id: "dissipated_assets",
          label: "Were any assets transferred or dissipated?",
          type: "yes_no",
          helpText:
            "Has the taxpayer transferred, sold, or otherwise dissipated assets that could have been used to pay the liability?",
        },
        {
          id: "dissipated_details",
          label: "Dissipated Assets Details",
          type: "textarea",
          placeholder:
            "Describe what assets were transferred, to whom, when, and for what consideration...",
          conditionals: [
            {
              field: "dissipated_assets",
              operator: "equals",
              value: true,
              action: "show",
            },
          ],
        },
      ],
    },
  ],
  crossFieldValidations: [
    ...(FORM_433A.crossFieldValidations || []),
    {
      id: "offer_meets_rcp_lump",
      description:
        "For lump-sum offers, the offer amount should meet or exceed the lump-sum RCP",
      fields: ["offer_amount", "rcp_lump", "offer_type"],
      rule: 'offer_type !== "lump_sum" || offer_amount >= rcp_lump',
      errorMessage:
        "Offer amount is below the lump-sum RCP. The IRS will likely reject offers below the RCP unless special circumstances apply.",
      severity: "warning",
    },
    {
      id: "offer_meets_rcp_periodic",
      description:
        "For periodic offers, the offer amount should meet or exceed the periodic RCP",
      fields: ["offer_amount", "rcp_periodic", "offer_type"],
      rule: 'offer_type !== "periodic" || offer_amount >= rcp_periodic',
      errorMessage:
        "Offer amount is below the periodic payment RCP. The IRS will likely reject offers below the RCP unless special circumstances apply.",
      severity: "warning",
    },
    {
      id: "offer_below_liability",
      description: "Offer amount should be less than total liability",
      fields: ["offer_amount", "total_liability"],
      rule: "offer_amount < total_liability",
      errorMessage:
        "Offer amount exceeds total liability — an OIC is unnecessary if you can pay in full.",
      severity: "warning",
    },
  ],
}
