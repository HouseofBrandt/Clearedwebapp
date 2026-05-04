import type { FormSchema } from "../types"
import { TAXPAYER_NAME_FIELD, SSN_FIELD, EIN_FIELD, SPOUSE_NAME_FIELD, SPOUSE_SSN_FIELD } from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { DAYTIME_PHONE_FIELD } from "../fragments/phone"

/**
 * IRS Form 843 — Claim for Refund and Request for Abatement
 *
 * Used to request:
 *   - Penalty abatement (most common use — e.g. failure-to-file, failure-to-pay)
 *   - Refund of taxes erroneously assessed
 *   - Refund of interest, fees, additions
 *
 * Cannot be used for income tax refunds (use Form 1040-X for that).
 *
 * Revision: August 2011 (still current — IRS hasn't revised since).
 */

export const FORM_843: FormSchema = {
  formNumber: "843",
  formTitle: "Claim for Refund and Request for Abatement",
  revisionDate: "August 2011",
  ombNumber: "1545-0024",
  totalSections: 5,
  estimatedMinutes: 20,
  resolutionMetadata: {
    resolutionPaths: ["penalty_abatement", "refund"],
    requirementLevel: { penalty_abatement: "required" },
    dependsOn: [],
    requiredBy: [],
    dataSources: ["case", "documents"],
    dataTargets: [],
  },
  crossFormMappings: [
    {
      sourceFormNumber: "433-A",
      fieldMap: {
        taxpayer_name:  "taxpayer_name",
        ssn:            "ssn",
        spouse_name:    "spouse_name",
        spouse_ssn:     "spouse_ssn",
        address_street: "address_street",
        address_city:   "address_city",
        address_state:  "address_state",
        address_zip:    "address_zip",
        home_phone:     "daytime_phone",
      },
    },
  ],

  sections: [
    // ── Section 1: Taxpayer Identification ───────────────────────────────
    {
      id: "taxpayer_info",
      title: "Taxpayer Identification",
      order: 1,
      fields: [
        TAXPAYER_NAME_FIELD,
        SSN_FIELD,
        SPOUSE_NAME_FIELD,
        SPOUSE_SSN_FIELD,
        EIN_FIELD,
        ...US_ADDRESS_FIELDS,
        DAYTIME_PHONE_FIELD,
      ],
    },

    // ── Section 2: Period and Type of Tax ────────────────────────────────
    {
      id: "tax_period",
      title: "Tax Period and Type",
      order: 2,
      fields: [
        {
          id: "period_from",
          label: "Period From (start of tax period)",
          type: "date",
          required: true,
          irsReference: "Line 1",
          helpText: "First day of the tax period — e.g. 1/1/2023 for calendar year 2023.",
        },
        {
          id: "period_to",
          label: "Period To (end of tax period)",
          type: "date",
          required: true,
          irsReference: "Line 1",
          helpText: "Last day of the tax period — e.g. 12/31/2023 for calendar year 2023.",
        },
        {
          id: "amount_to_be_refunded",
          label: "Amount to Be Refunded or Abated",
          type: "currency",
          required: true,
          irsReference: "Line 2",
          helpText: "The dollar amount of penalty, interest, or tax you want refunded/abated.",
        },
        {
          id: "tax_type",
          label: "Type of Tax",
          type: "single_select",
          required: true,
          irsReference: "Line 3",
          options: [
            { value: "employment", label: "Employment Tax" },
            { value: "estate", label: "Estate Tax" },
            { value: "gift", label: "Gift Tax" },
            { value: "excise", label: "Excise Tax" },
            { value: "income", label: "Income Tax (only for non-1040 income tax — use 1040-X for individual income tax refund)" },
            { value: "fee", label: "Fee" },
            { value: "penalty", label: "Penalty" },
            { value: "other", label: "Other (specify in narrative)" },
          ],
        },
        {
          id: "tax_form_filed",
          label: "Federal Tax Form Originally Filed",
          type: "text",
          irsReference: "Line 4",
          placeholder: "e.g. 1040, 941, 940, 706",
        },
      ],
    },

    // ── Section 3: Penalty / Interest Detail ─────────────────────────────
    {
      id: "abatement_detail",
      title: "Penalty / Interest / Fee Detail",
      irsInstructions:
        "Specify exactly which penalty(ies) or charge(s) you want abated. Use the IRS code citation when known.",
      order: 3,
      fields: [
        {
          id: "irs_code_section",
          label: "IRC Section (if requesting abatement of a specific penalty)",
          type: "text",
          irsReference: "Line 4",
          placeholder: "e.g. IRC 6651(a)(1) for failure to file",
          helpText:
            "Common: 6651(a)(1) failure to file; 6651(a)(2) failure to pay; 6654 estimated tax; 6656 deposit; 6662 accuracy-related.",
        },
        {
          id: "penalty_type",
          label: "Penalty / Charge Being Contested",
          type: "single_select",
          irsReference: "Line 5",
          options: [
            { value: "ftf", label: "Failure to File (FTF)" },
            { value: "ftp", label: "Failure to Pay (FTP)" },
            { value: "ftd", label: "Failure to Deposit (FTD)" },
            { value: "estimated_tax", label: "Estimated Tax Penalty" },
            { value: "accuracy", label: "Accuracy-Related Penalty" },
            { value: "interest", label: "Interest" },
            { value: "other", label: "Other (specify in narrative)" },
          ],
        },
        {
          id: "abatement_basis",
          label: "Reason for Abatement Request",
          type: "single_select",
          required: true,
          irsReference: "Line 5a",
          options: [
            { value: "first_time", label: "First-Time Penalty Abatement (FTA)" },
            { value: "reasonable_cause", label: "Reasonable Cause" },
            { value: "statutory_exception", label: "Statutory Exception" },
            { value: "irs_error", label: "IRS Error" },
            { value: "other", label: "Other (explain in narrative)" },
          ],
          helpText:
            "FTA: clean compliance history for prior 3 years. Reasonable Cause: a specific event (illness, disaster, mail issue). Statutory: a Code section provides relief.",
        },
      ],
    },

    // ── Section 4: Explanation / Narrative ───────────────────────────────
    {
      id: "explanation",
      title: "Explanation of Claim",
      irsInstructions:
        "Explain in detail why you believe the penalty/tax should be abated or refunded. Attach supporting documentation.",
      order: 4,
      fields: [
        {
          id: "narrative_explanation",
          label: "Narrative Explanation",
          type: "textarea",
          required: true,
          irsReference: "Line 7",
          helpText:
            "For Reasonable Cause requests: be specific. Describe what happened, when, why it prevented compliance, and what you did to remedy it. Cite Internal Revenue Manual (IRM) sections when possible (e.g. IRM 20.1.1).",
          placeholder:
            "On [date], the taxpayer experienced [event] which prevented timely [filing/payment]. Specifically, [details]. Once [event] was resolved on [date], the taxpayer immediately [remedial action]. The taxpayer has otherwise been in compliance with all federal tax obligations...",
        },
        {
          id: "supporting_docs_attached",
          label: "Are supporting documents attached?",
          type: "yes_no",
          irsReference: "Line 7",
          helpText:
            "Examples: medical records, death certificate, fire/flood report, IRS correspondence, mailing receipts.",
        },
        {
          id: "supporting_docs_list",
          label: "List of Supporting Documents",
          type: "textarea",
          conditionals: [
            { field: "supporting_docs_attached", operator: "equals", value: true, action: "show" },
          ],
          placeholder: "1. Hospital discharge summary dated 4/12/2023\n2. ...",
        },
      ],
    },

    // ── Section 5: Signatures ────────────────────────────────────────────
    {
      id: "signatures",
      title: "Signatures",
      order: 5,
      fields: [
        {
          id: "taxpayer_signature",
          label: "Taxpayer Signature",
          type: "text",
          required: true,
        },
        {
          id: "taxpayer_signature_date",
          label: "Date Signed",
          type: "date",
          required: true,
        },
        {
          id: "spouse_signature",
          label: "Spouse Signature (if joint return)",
          type: "text",
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
        {
          id: "preparer_name",
          label: "Preparer Name",
          type: "text",
        },
        {
          id: "preparer_ptin",
          label: "Preparer PTIN",
          type: "text",
          validation: [
            { type: "pattern", value: "^P\\d{8}$", message: "PTIN format: P followed by 8 digits" },
          ],
        },
        {
          id: "preparer_phone",
          label: "Preparer Phone",
          type: "phone",
        },
        {
          id: "preparer_signature",
          label: "Preparer Signature",
          type: "text",
        },
        {
          id: "preparer_signature_date",
          label: "Preparer Date Signed",
          type: "date",
        },
      ],
    },
  ],

  crossFieldValidations: [
    {
      id: "period_to_after_period_from",
      description: "Period end date must be on or after period start date",
      fields: ["period_from", "period_to"],
      rule: "period_to >= period_from",
      errorMessage: "The period end date must be on or after the period start date.",
      severity: "error",
    },
    {
      id: "fta_compliance_check",
      description: "FTA requires clean prior 3 years",
      fields: ["abatement_basis", "narrative_explanation"],
      rule: "if abatement_basis == 'first_time' then narrative_explanation contains 'prior 3 years'",
      errorMessage:
        "First-Time Abatement requests should mention the taxpayer's compliance history for the prior 3 years.",
      severity: "warning",
    },
  ],
}
