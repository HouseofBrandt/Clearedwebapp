import type { FormSchema } from "../types"
import {
  TAXPAYER_NAME_FIELD,
  SSN_FIELD,
  DOB_FIELD,
} from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { TAXPAYER_SIGNATURE_FIELDS } from "../fragments/signature"

// Form 14039 — Identity Theft Affidavit.
//
// Used when a client's SSN has been misused for tax purposes (fraudulent
// return, rejected e-file due to duplicate SSN, unexpected IRS notices,
// etc.). Triggers IRS IP-PIN program enrollment and unmasks the fraudulent
// return from the client's account.

export const FORM_14039: FormSchema = {
  formNumber: "14039",
  formTitle: "Identity Theft Affidavit",
  currentRevision: "2022-12",
  supportedRevisions: ["2022-12"],
  revisionDate: "2022-12",
  ombNumber: "1545-2139",
  totalSections: 4,
  estimatedMinutes: 15,
  resolutionMetadata: {
    resolutionPaths: [],
    requirementLevel: {},
    dependsOn: [],
    requiredBy: [],
    dataSources: [],
    dataTargets: [],
  },
  sections: [
    {
      id: "reason",
      title: "Reason for Submitting",
      order: 1,
      fields: [
        {
          id: "submission_reason",
          label: "Why are you submitting this form?",
          type: "single_select",
          required: true,
          options: [
            { value: "actual_id_theft",  label: "I am a victim of identity theft affecting my federal tax records" },
            { value: "potential_theft",  label: "I am not a victim but am at risk due to a data breach or lost wallet" },
          ],
        },
        {
          id: "circumstances",
          label: "Briefly describe the circumstances",
          type: "textarea",
          required: true,
          helpText: "What happened? When did you become aware? What indications of misuse have you seen (rejected e-file, unexpected notice, unknown wages on transcript, etc.)?",
          validation: [
            { type: "min_length", value: 50, message: "Please describe the circumstances in more detail." },
          ],
        },
      ],
    },
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      order: 2,
      fields: [
        TAXPAYER_NAME_FIELD,
        SSN_FIELD,
        DOB_FIELD,
        ...US_ADDRESS_FIELDS,
        { id: "phone", label: "Phone", type: "phone", required: true },
        { id: "email", label: "Email", type: "text" },
        {
          id: "taxpayer_status",
          label: "Taxpayer Status",
          type: "single_select",
          options: [
            { value: "deceased_victim",  label: "Filing on behalf of a deceased identity-theft victim" },
            { value: "minor_victim",     label: "Parent/guardian of a minor victim" },
            { value: "self",             label: "Self" },
          ],
          defaultValue: "self",
        },
      ],
    },
    {
      id: "tax_years_affected",
      title: "Tax Years Affected",
      order: 3,
      fields: [
        {
          id: "affected_years",
          label: "Tax Year(s) Affected",
          type: "text",
          required: true,
          placeholder: "e.g., 2022, 2023",
          helpText: "List every tax year you believe your SSN was misused. If unknown, enter 'Unknown'.",
        },
        {
          id: "supporting_docs_list",
          label: "Documents You're Enclosing",
          type: "multi_select",
          options: [
            { value: "police_report",      label: "Copy of police / FTC identity theft report" },
            { value: "drivers_license",    label: "Copy of government-issued photo ID" },
            { value: "ssn_card",           label: "Copy of Social Security card" },
            { value: "rejected_return",    label: "Copy of rejected e-file notice / 5071C letter" },
            { value: "other",              label: "Other (describe below)" },
          ],
        },
        {
          id: "supporting_docs_other",
          label: "Other Documents — Description",
          type: "textarea",
          conditionals: [
            { field: "supporting_docs_list", operator: "contains", value: "other", action: "show" },
          ],
        },
      ],
    },
    {
      id: "signature",
      title: "Signature",
      order: 4,
      irsInstructions: "Under penalty of perjury, sign to affirm the information is accurate.",
      fields: [
        ...TAXPAYER_SIGNATURE_FIELDS,
      ],
    },
  ],
}
