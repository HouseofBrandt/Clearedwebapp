import type { FormSchema } from "../types"
import { TAXPAYER_NAME_FIELD, SSN_FIELD, EIN_FIELD, SPOUSE_NAME_FIELD, SPOUSE_SSN_FIELD } from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { TAX_PERIODS_GROUP } from "../fragments/tax-periods"

/**
 * IRS Form 656 — Offer in Compromise
 *
 * Used by individuals and businesses to settle a tax debt for less than the
 * full amount owed. Filed alongside Form 433-A (OIC) or 433-B (OIC) and the
 * required application fee + initial payment.
 *
 * Revision: April 2024 (the most recent at the time of writing).
 */

export const FORM_656: FormSchema = {
  formNumber: "656",
  formTitle: "Offer in Compromise",
  revisionDate: "April 2024",
  ombNumber: "1545-0074",
  totalSections: 9,
  estimatedMinutes: 35,
  resolutionMetadata: {
    resolutionPaths: ["oic"],
    requirementLevel: { oic: "required" },
    dependsOn: ["433-A-OIC", "433-B-OIC"],
    requiredBy: [],
    dataSources: ["case", "433-A-OIC", "433-B-OIC"],
    dataTargets: [],
  },
  crossFormMappings: [
    // 656 inherits the OIC computation worksheet from 433-A-OIC. Most
    // identifying info + the offer numbers carry over 1-to-1.
    {
      sourceFormNumber: "433-A-OIC",
      fieldMap: {
        taxpayer_name:                  "taxpayer_name",
        ssn:                            "ssn",
        spouse_name:                    "spouse_name",
        spouse_ssn:                     "spouse_ssn",
        address_street:                 "address_street",
        address_city:                   "address_city",
        address_state:                  "address_state",
        address_zip:                    "address_zip",
        home_phone:                     "phone",
        total_liability:                "total_liability",
        offer_amount:                   "offer_amount",
        offer_type:                     "offer_type",
        oic_basis:                      "oic_basis",
        special_circumstances_narrative: "special_circumstances_narrative",
      },
    },
  ],

  sections: [
    // ── Section 1: Your Contact Information ──────────────────────────────
    {
      id: "taxpayer_info",
      title: "Your Contact Information",
      description: "Identifying information for the taxpayer making the offer",
      irsInstructions:
        "Enter the taxpayer information exactly as it appears on the most recent tax return.",
      order: 1,
      fields: [
        TAXPAYER_NAME_FIELD,
        SPOUSE_NAME_FIELD,
        SSN_FIELD,
        SPOUSE_SSN_FIELD,
        ...US_ADDRESS_FIELDS,
        EIN_FIELD,
      ],
    },

    // ── Section 2: Tax Periods ───────────────────────────────────────────
    {
      id: "tax_periods",
      title: "Tax Periods Included in This Offer",
      description: "List every tax period (year + form) the offer covers",
      irsInstructions:
        "List ALL tax periods you are offering to compromise. The IRS will not consider periods not listed here.",
      order: 2,
      fields: [
        TAX_PERIODS_GROUP,
      ],
    },

    // ── Section 3: Reason for Offer ──────────────────────────────────────
    {
      id: "reason_for_offer",
      title: "Reason for Offer",
      description:
        "The legal basis under which the offer is being submitted",
      order: 3,
      fields: [
        {
          id: "oic_basis",
          label: "OIC Basis",
          type: "single_select",
          required: true,
          irsReference: "Section 3",
          helpText:
            "Doubt as to Collectibility: you can't pay the full amount. Doubt as to Liability: you don't agree the amount is correct. Effective Tax Administration: payment would create economic hardship or be unfair.",
          options: [
            { value: "doubt_collectibility", label: "Doubt as to Collectibility (DATC)" },
            { value: "doubt_liability", label: "Doubt as to Liability (DATL)" },
            { value: "effective_tax_admin", label: "Effective Tax Administration (ETA)" },
            { value: "datc_special_circumstances", label: "DATC with Special Circumstances" },
          ],
        },
        {
          id: "exceptional_circumstances",
          label: "Exceptional Circumstances Narrative",
          type: "textarea",
          irsReference: "Section 3",
          helpText:
            "Required for ETA and DATC-Special Circumstances offers. Describe why payment would create economic hardship or be unfair.",
          conditionals: [
            { field: "oic_basis", operator: "equals", value: "effective_tax_admin", action: "show" },
            { field: "oic_basis", operator: "equals", value: "datc_special_circumstances", action: "show" },
          ],
        },
      ],
    },

    // ── Section 4: Payment Terms ─────────────────────────────────────────
    {
      id: "payment_terms",
      title: "Payment Terms",
      description: "Offer amount and how it will be paid",
      irsInstructions:
        "Lump Sum Cash: pay 20% of offer with submission, balance within 5 months of acceptance. Periodic Payment: pay first installment with submission, continue monthly while IRS evaluates.",
      order: 4,
      fields: [
        {
          id: "offer_amount",
          label: "Total Offer Amount",
          type: "currency",
          required: true,
          irsReference: "Section 4",
          validation: [
            { type: "required", message: "Offer amount is required" },
            { type: "min", value: 1, message: "Offer must be greater than $0" },
          ],
          helpText:
            "Must equal or exceed the Reasonable Collection Potential (RCP) calculated on Form 433-A (OIC) Section 7.",
        },
        {
          id: "payment_option",
          label: "Payment Option",
          type: "single_select",
          required: true,
          irsReference: "Section 4",
          options: [
            { value: "lump_sum", label: "Lump Sum Cash (5 or fewer payments within 5 months)" },
            { value: "periodic", label: "Periodic Payment (6–24 monthly installments)" },
          ],
        },
        {
          id: "initial_payment",
          label: "Initial Payment with Application",
          type: "currency",
          required: true,
          irsReference: "Section 4",
          helpText:
            "Lump Sum: 20% of offer amount. Periodic: first proposed installment.",
        },
        {
          id: "subsequent_payments_schedule",
          label: "Schedule of Subsequent Payments",
          type: "textarea",
          irsReference: "Section 4",
          helpText:
            "Describe when remaining payments will be made. Lump Sum: balance within 5 months of acceptance. Periodic: monthly amounts and dates.",
        },
        {
          id: "low_income_certification",
          label: "Low Income Certification (waives application fee)",
          type: "yes_no",
          irsReference: "Section 4",
          helpText:
            "Check if your gross monthly household income is at or below the IRS Low Income Certification guidelines (waives the $205 application fee and initial payment).",
        },
      ],
    },

    // ── Section 5: Designation of Payment ────────────────────────────────
    {
      id: "designation_of_payment",
      title: "Designation of Payment",
      description: "Direct how payments are applied to specific periods",
      order: 5,
      fields: [
        {
          id: "designate_payment",
          label: "Designate Payment to Specific Period",
          type: "yes_no",
          irsReference: "Section 5",
          helpText:
            "If checked, the IRS will apply your initial payment to the period you specify (typically the most recent period to maximize trust fund recovery). Otherwise, payment is applied to the IRS's best interest.",
        },
        {
          id: "designation_period",
          label: "Designated Tax Period",
          type: "text",
          irsReference: "Section 5",
          helpText: "Format: form + period, e.g. '1040 12/2023' or '941 6/2022'",
          conditionals: [
            { field: "designate_payment", operator: "equals", value: true, action: "show" },
          ],
        },
      ],
    },

    // ── Section 6: Source of Funds ───────────────────────────────────────
    {
      id: "source_of_funds",
      title: "Source of Funds",
      description: "Where the offer money is coming from",
      order: 6,
      fields: [
        {
          id: "funds_source",
          label: "Source of Funds for Offer",
          type: "textarea",
          required: true,
          irsReference: "Section 6",
          helpText:
            "Describe how you will obtain the funds. Examples: liquidation of retirement account, family loan, sale of property, savings.",
        },
        {
          id: "funds_borrowed",
          label: "Are funds borrowed?",
          type: "yes_no",
          irsReference: "Section 6",
        },
        {
          id: "funds_lender",
          label: "Lender Name (if borrowed)",
          type: "text",
          conditionals: [
            { field: "funds_borrowed", operator: "equals", value: true, action: "show" },
          ],
        },
      ],
    },

    // ── Section 7: Offer Terms ───────────────────────────────────────────
    {
      id: "offer_terms",
      title: "Offer Terms (Acknowledgment)",
      description:
        "Mandatory acknowledgments — the taxpayer agrees to all of these conditions by submitting the offer",
      irsInstructions:
        "Each item in this section is a binding term of the offer. Read carefully before signing.",
      order: 7,
      fields: [
        {
          id: "acknowledge_5yr_compliance",
          label: "I will file all required tax returns and pay all taxes for 5 years after acceptance",
          type: "yes_no",
          required: true,
          irsReference: "Section 7",
        },
        {
          id: "acknowledge_keep_refunds",
          label: "I understand the IRS will keep any refund for the year the offer is accepted (and prior years)",
          type: "yes_no",
          required: true,
          irsReference: "Section 7",
        },
        {
          id: "acknowledge_lien_remains",
          label: "I understand any tax lien remains until the offer terms are fulfilled",
          type: "yes_no",
          required: true,
          irsReference: "Section 7",
        },
        {
          id: "acknowledge_csed_suspended",
          label: "I understand the collection statute (CSED) is suspended while the offer is pending",
          type: "yes_no",
          required: true,
          irsReference: "Section 7",
        },
      ],
    },

    // ── Section 8: Signatures ────────────────────────────────────────────
    {
      id: "signatures",
      title: "Signatures",
      description: "Taxpayer (and spouse, if MFJ) signatures and dates",
      order: 8,
      fields: [
        {
          id: "taxpayer_signature",
          label: "Taxpayer Signature",
          type: "text",
          required: true,
          irsReference: "Section 8",
          helpText: "Type the taxpayer's full name to attest. Wet signature required on filed copy.",
        },
        {
          id: "taxpayer_signature_date",
          label: "Date Signed",
          type: "date",
          required: true,
          irsReference: "Section 8",
        },
        {
          id: "spouse_signature",
          label: "Spouse Signature",
          type: "text",
          irsReference: "Section 8",
          conditionals: [
            { field: "spouse_name", operator: "is_not_empty", value: null, action: "show" },
          ],
        },
        {
          id: "spouse_signature_date",
          label: "Spouse Date Signed",
          type: "date",
          conditionals: [
            { field: "spouse_name", operator: "is_not_empty", value: null, action: "show" },
          ],
        },
      ],
    },

    // ── Section 9: Practitioner / Third Party ────────────────────────────
    {
      id: "practitioner",
      title: "Paid Preparer / Authorized Representative",
      description:
        "Information for the licensed practitioner submitting the offer on the taxpayer's behalf",
      order: 9,
      fields: [
        {
          id: "preparer_name",
          label: "Preparer Name",
          type: "text",
          irsReference: "Section 9",
        },
        {
          id: "preparer_firm",
          label: "Firm Name",
          type: "text",
          irsReference: "Section 9",
        },
        {
          id: "preparer_address",
          label: "Firm Address",
          type: "text",
          irsReference: "Section 9",
        },
        {
          id: "preparer_phone",
          label: "Preparer Phone",
          type: "phone",
          irsReference: "Section 9",
        },
        {
          id: "preparer_ein",
          label: "Firm EIN",
          type: "ein",
          irsReference: "Section 9",
        },
        {
          id: "preparer_ptin",
          label: "Preparer PTIN",
          type: "text",
          irsReference: "Section 9",
          validation: [
            { type: "pattern", value: "^P\\d{8}$", message: "PTIN format: P followed by 8 digits" },
          ],
        },
        {
          id: "preparer_signature",
          label: "Preparer Signature",
          type: "text",
          irsReference: "Section 9",
        },
        {
          id: "preparer_signature_date",
          label: "Date",
          type: "date",
          irsReference: "Section 9",
        },
      ],
    },
  ],

  crossFieldValidations: [
    {
      id: "offer_meets_initial_payment",
      description: "Initial payment must be at least 20% of offer for lump sum offers",
      fields: ["payment_option", "offer_amount", "initial_payment"],
      rule: "if payment_option == 'lump_sum' then initial_payment >= 0.2 * offer_amount",
      errorMessage:
        "For lump sum offers, the initial payment must be at least 20% of the offer amount.",
      severity: "error",
    },
    {
      id: "offer_basis_requires_narrative",
      description:
        "ETA and DATC-Special Circumstances offers require an exceptional circumstances narrative",
      fields: ["oic_basis", "exceptional_circumstances"],
      rule:
        "if oic_basis in ['effective_tax_admin', 'datc_special_circumstances'] then exceptional_circumstances is_not_empty",
      errorMessage:
        "ETA and DATC-Special Circumstances offers require a narrative explaining the exceptional circumstances.",
      severity: "error",
    },
  ],
}
