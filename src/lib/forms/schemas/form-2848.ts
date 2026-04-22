import type { FormSchema } from "../types"
import {
  TAXPAYER_NAME_FIELD,
  SSN_FIELD,
  EIN_FIELD,
} from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { TAXPAYER_SIGNATURE_FIELDS, SPOUSE_SIGNATURE_FIELDS } from "../fragments/signature"

// Form 2848 — Power of Attorney and Declaration of Representative.
//
// The gatekeeper form for every resolution path. Without a 2848 on file,
// Cleared cannot produce compliant representation for any client.
//
// Structure:
//   Part 1 — Power of Attorney
//     Line 1 — Taxpayer information
//     Line 2 — Representative(s) — up to 4
//     Line 3 — Acts authorized (tax matters, forms, years)
//     Line 4 — Specific use (non-recorded CAF scenarios)
//     Line 5a — Additional acts authorized
//     Line 5b — Specific acts NOT authorized
//     Line 6 — Retention / revocation
//     Line 7 — Taxpayer signature
//   Part 2 — Declaration of Representative
//     Signed by each representative, asserts licensure basis.

export const FORM_2848: FormSchema = {
  formNumber: "2848",
  formTitle: "Power of Attorney and Declaration of Representative",
  currentRevision: "2021-01",
  supportedRevisions: ["2021-01"],
  revisionDate: "2021-01",
  ombNumber: "1545-0150",
  totalSections: 5,
  estimatedMinutes: 20,
  resolutionMetadata: {
    resolutionPaths: ["oic", "ia", "cnc", "cdp", "penalty", "innocent_spouse", "advocate", "lien_relief"],
    requirementLevel: {
      oic: "required", ia: "required", cnc: "required", cdp: "required",
      penalty: "required", innocent_spouse: "required", advocate: "required", lien_relief: "required",
    },
    dependsOn: [],
    requiredBy: ["656", "9465", "843", "8857", "911", "12153", "12277", "433-A", "433-A-OIC"],
    dataSources: [],
    dataTargets: ["representative_name", "representative_phone", "caf_number", "rep_name", "rep_phone", "rep_caf"],
  },
  crossFormMappings: [],
  sections: [
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      order: 1,
      irsInstructions: "Enter the taxpayer's identifying information as it appears on their most recent tax return.",
      fields: [
        { ...TAXPAYER_NAME_FIELD, irsReference: "Line 1 — Taxpayer name" },
        SSN_FIELD,
        {
          id: "use_ein_instead",
          label: "This is a business — use EIN",
          type: "yes_no",
          helpText: "Check if taxpayer is a business entity rather than an individual.",
        },
        { ...EIN_FIELD, conditionals: [{ field: "use_ein_instead", operator: "equals", value: true, action: "show" }] },
        ...US_ADDRESS_FIELDS,
        { id: "daytime_phone", label: "Daytime Phone", type: "phone", required: true, irsReference: "Line 1" },
        { id: "plan_number", label: "Plan Number (if applicable)", type: "text", helpText: "For employee benefit plan cases." },
      ],
    },
    {
      id: "representatives",
      title: "Representatives (up to 4)",
      order: 2,
      irsInstructions: "Each representative must sign Part 2 (Declaration of Representative) below, asserting their basis for practice before the IRS.",
      fields: [
        {
          id: "representatives",
          label: "Representatives",
          type: "repeating_group",
          minGroups: 1,
          maxGroups: 4,
          required: true,
          groupFields: [
            { id: "rep_name", label: "Name", type: "text", required: true },
            { id: "rep_caf_number", label: "CAF Number", type: "text", helpText: "Leave blank if CAF has not yet been assigned." },
            { id: "rep_ptin", label: "PTIN", type: "text" },
            { id: "rep_address", label: "Mailing Address (street)", type: "text", required: true },
            { id: "rep_city", label: "City", type: "text", required: true },
            { id: "rep_state", label: "State", type: "text", required: true },
            { id: "rep_zip", label: "ZIP", type: "text", required: true },
            { id: "rep_phone", label: "Phone", type: "phone", required: true },
            { id: "rep_fax", label: "Fax", type: "phone" },
            {
              id: "rep_designation",
              label: "Designation (basis for practice)",
              type: "single_select",
              required: true,
              options: [
                { value: "a", label: "a — Attorney" },
                { value: "b", label: "b — CPA" },
                { value: "c", label: "c — Enrolled Agent" },
                { value: "d", label: "d — Officer of the taxpayer (corporate)" },
                { value: "e", label: "e — Full-time employee of the taxpayer" },
                { value: "f", label: "f — Family member" },
                { value: "g", label: "g — Enrolled Actuary (per Reg § 10.3(d))" },
                { value: "h", label: "h — Unenrolled Return Preparer (per Rev. Proc. 81-38)" },
                { value: "i", label: "i — Registered Tax Return Preparer (per Reg § 10.3(f))" },
                { value: "k", label: "k — Student attorney or CPA" },
                { value: "r", label: "r — Enrolled Retirement Plan Agent" },
              ],
            },
            { id: "rep_jurisdiction", label: "Jurisdiction / Licensing Authority", type: "text", helpText: "E.g., 'California' for CA-licensed attorney, or 'EA' for enrolled agents." },
            { id: "rep_bar_license_number", label: "Bar / License / Enrollment Number", type: "text" },
            {
              id: "rep_can_receive_refund_checks",
              label: "Authorized to receive refund checks on behalf of taxpayer",
              type: "yes_no",
              helpText: "Rarely selected — strongly discouraged by IRS; refunds normally go directly to taxpayer.",
            },
          ],
        },
      ],
    },
    {
      id: "acts_authorized",
      title: "Acts Authorized",
      order: 3,
      irsInstructions: "Describe the tax matters and periods for which you authorize representation.",
      fields: [
        {
          id: "tax_matters",
          label: "Tax Matters",
          type: "repeating_group",
          minGroups: 1,
          maxGroups: 10,
          required: true,
          helpText: "One row per matter. 'Tax Form Number' is the IRS form, e.g., 1040, 1065, 941. 'Year(s) or Period(s)' uses formats like '2020', '2019-2021', or '202103' for a specific quarter.",
          groupFields: [
            {
              id: "tm_description",
              label: "Description of Matter",
              type: "text",
              required: true,
              placeholder: "e.g., Income, Estate, Gift, Employment",
            },
            {
              id: "tm_tax_form_number",
              label: "Tax Form Number",
              type: "text",
              required: true,
              placeholder: "e.g., 1040, 941, 1065",
            },
            {
              id: "tm_years_or_periods",
              label: "Year(s) or Period(s)",
              type: "text",
              required: true,
              placeholder: "e.g., 2019, 2020, 2021",
            },
          ],
        },
        {
          id: "prior_2848_revoked",
          label: "Revoke all prior powers of attorney (check to replace)",
          type: "yes_no",
          helpText: "If checked, all previously filed Forms 2848 for these same matters will be revoked. Attach copies of prior 2848(s) being revoked.",
          irsReference: "Line 6",
        },
      ],
    },
    {
      id: "specific_authorizations",
      title: "Specific Authorizations & Exclusions",
      order: 4,
      fields: [
        {
          id: "additional_acts",
          label: "Additional Acts Authorized",
          type: "multi_select",
          irsReference: "Line 5a",
          options: [
            { value: "substitute_reps",      label: "Authorize substitutes / additional representatives" },
            { value: "sign_return",           label: "Sign a return (rare; only for specific statutory cases)" },
            { value: "receive_refund_checks", label: "Receive refund checks" },
            { value: "other_acts",            label: "Other acts (describe below)" },
          ],
        },
        {
          id: "other_acts_description",
          label: "Other Acts — Description",
          type: "textarea",
          conditionals: [
            { field: "additional_acts", operator: "contains", value: "other_acts", action: "show" },
          ],
        },
        {
          id: "specific_acts_not_authorized",
          label: "Specific Acts NOT Authorized",
          type: "textarea",
          helpText: "List any otherwise-default acts the taxpayer wants to explicitly withhold from the representative.",
          irsReference: "Line 5b",
        },
      ],
    },
    {
      id: "signatures",
      title: "Signatures",
      order: 5,
      irsInstructions: "The taxpayer (and spouse, for joint matters) must sign. Each representative must also sign Part 2 with their designation and jurisdiction.",
      fields: [
        ...TAXPAYER_SIGNATURE_FIELDS,
        {
          id: "filing_status",
          label: "Is this a joint (MFJ) matter?",
          type: "single_select",
          options: [
            { value: "MFJ", label: "Yes — joint return" },
            { value: "OTHER", label: "No" },
          ],
          helpText: "If yes, the spouse must also sign.",
        },
        ...SPOUSE_SIGNATURE_FIELDS,
      ],
    },
  ],
  crossFieldValidations: [
    {
      id: "rep_designation_consistency",
      description: "If designation is (a), (b), or (c), jurisdiction and license number must be filled.",
      fields: ["representatives"],
      rule: "representatives.every(r => !['a','b','c'].includes(r.rep_designation) || (r.rep_jurisdiction && r.rep_bar_license_number))",
      errorMessage: "Attorneys, CPAs, and Enrolled Agents must provide jurisdiction and license/enrollment number.",
      severity: "error",
    },
  ],
}
