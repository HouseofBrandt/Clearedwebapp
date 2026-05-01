import type { FormSchema } from "../types"
import {
  TAXPAYER_NAME_FIELD,
  SSN_FIELD,
  SPOUSE_NAME_FIELD,
  SPOUSE_SSN_FIELD,
} from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { TAXPAYER_SIGNATURE_FIELDS, SPOUSE_SIGNATURE_FIELDS } from "../fragments/signature"

// Form 4506-T — Request for Transcript of Tax Return.
//
// Used in virtually every resolution path. Practitioners get account
// transcripts, wage and income transcripts, and record of account
// transcripts to establish the liability baseline and CSED dates.

export const FORM_4506T: FormSchema = {
  formNumber: "4506-T",
  formTitle: "Request for Transcript of Tax Return",
  currentRevision: "2023-03",
  supportedRevisions: ["2023-03"],
  revisionDate: "2023-03",
  ombNumber: "1545-1872",
  totalSections: 3,
  estimatedMinutes: 10,
  resolutionMetadata: {
    resolutionPaths: ["oic", "ia", "cnc", "cdp", "penalty", "innocent_spouse", "advocate", "lien_relief"],
    requirementLevel: {
      oic: "required", ia: "required", cnc: "required", cdp: "required",
      penalty: "required", innocent_spouse: "required", advocate: "required", lien_relief: "required",
    },
    dependsOn: ["2848"],
    requiredBy: [],
    dataSources: [],
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
      },
    },
  ],
  sections: [
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      order: 1,
      fields: [
        { ...TAXPAYER_NAME_FIELD, irsReference: "Line 1a — First name shown on return" },
        SSN_FIELD,
        SPOUSE_NAME_FIELD,
        SPOUSE_SSN_FIELD,
        ...US_ADDRESS_FIELDS,
        {
          id: "previous_address",
          label: "Previous Address (if changed in last 4 years)",
          type: "text",
          irsReference: "Line 4",
          helpText: "Needed only if the address on the return being requested differs from current address.",
        },
      ],
    },
    {
      id: "transcript_request",
      title: "Transcript Request",
      order: 2,
      irsInstructions: "Select the type of transcript and the tax form + year(s) you need.",
      fields: [
        {
          id: "mail_to_third_party",
          label: "Mail transcript to a third party (line 5)",
          type: "yes_no",
          helpText: "Check only if transcript should go to someone other than the taxpayer. The third party's CAF number and address are required.",
          irsReference: "Line 5",
        },
        {
          id: "third_party_name",
          label: "Third-Party Name (firm or CAF holder)",
          type: "text",
          conditionals: [{ field: "mail_to_third_party", operator: "equals", value: true, action: "show" }],
        },
        {
          id: "third_party_address",
          label: "Third-Party Address",
          type: "text",
          conditionals: [{ field: "mail_to_third_party", operator: "equals", value: true, action: "show" }],
        },
        {
          id: "transcript_type",
          label: "Type of Transcript",
          type: "single_select",
          required: true,
          options: [
            { value: "return",         label: "Return Transcript (line 6a)" },
            { value: "account",        label: "Account Transcript (line 6b)" },
            { value: "record_of_acct", label: "Record of Account Transcript (line 6c) — combines return + account" },
            { value: "wage_income",    label: "Wage and Income Transcript (line 8)" },
            { value: "verification",   label: "Verification of Non-filing Letter (line 7)" },
          ],
          helpText: "Record of Account is the most useful single transcript — it includes both return data and account activity.",
          irsReference: "Lines 6/7/8",
        },
        {
          id: "tax_form",
          label: "Tax Form Number",
          type: "text",
          required: true,
          placeholder: "e.g., 1040, 1065, 941",
          helpText: "The form you want a transcript of. For individual transcripts, use 1040.",
          irsReference: "Line 6",
        },
        {
          id: "tax_years",
          label: "Tax Years (up to 4)",
          type: "repeating_group",
          minGroups: 1,
          maxGroups: 4,
          required: true,
          irsReference: "Line 9",
          groupFields: [
            {
              id: "ty_year",
              label: "Tax Year Ended (MM/DD/YYYY)",
              type: "date",
              required: true,
              helpText: "Use 12/31/YYYY for calendar-year 1040s. For quarterly forms, use end-of-quarter.",
            },
          ],
        },
      ],
    },
    {
      id: "signatures",
      title: "Signature",
      order: 3,
      irsInstructions: "The taxpayer must sign. For joint returns, either spouse may sign unless a specific spouse's information is being requested.",
      fields: [
        ...TAXPAYER_SIGNATURE_FIELDS,
        {
          id: "filing_status",
          label: "Filing status for the tax year(s) requested",
          type: "single_select",
          options: [
            { value: "MFJ",   label: "Married filing jointly" },
            { value: "SINGLE", label: "Single" },
            { value: "MFS",    label: "Married filing separately" },
            { value: "HOH",    label: "Head of household" },
            { value: "QSS",    label: "Qualifying surviving spouse" },
          ],
          helpText: "If MFJ, spouse signature may be required.",
        },
        ...SPOUSE_SIGNATURE_FIELDS,
      ],
    },
  ],
}
