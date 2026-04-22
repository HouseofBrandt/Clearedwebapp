import type { FormSchema } from "../types"
import {
  TAXPAYER_NAME_FIELD,
  SSN_FIELD,
  EIN_FIELD,
} from "../fragments/identity"
import { US_ADDRESS_FIELDS } from "../fragments/address"
import { TAXPAYER_SIGNATURE_FIELDS } from "../fragments/signature"
import { REASONABLE_CAUSE_FIELDS } from "../fragments/reasonable-cause"

// Form 12277 — Application for Withdrawal of Filed Notice of Federal Tax Lien
// (IRC § 6323(j)).
//
// Lien *withdrawal* is different from lien *release*. Withdrawal removes
// the public record of the lien as if it had never been filed. Release
// only marks it as satisfied but the history remains. Withdrawal is the
// better outcome for the taxpayer but requires one of four statutory
// grounds.

export const FORM_12277: FormSchema = {
  formNumber: "12277",
  formTitle: "Application for Withdrawal of Filed Notice of Federal Tax Lien",
  currentRevision: "2011-10",
  supportedRevisions: ["2011-10"],
  revisionDate: "2011-10",
  ombNumber: "1545-1916",
  totalSections: 3,
  estimatedMinutes: 15,
  resolutionMetadata: {
    resolutionPaths: ["lien_relief"],
    requirementLevel: {
      lien_relief: "required",
    },
    dependsOn: ["2848"],
    requiredBy: [],
    dataSources: [],
    dataTargets: [],
  },
  sections: [
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      order: 1,
      fields: [
        TAXPAYER_NAME_FIELD,
        SSN_FIELD,
        {
          id: "is_business",
          label: "This is a business",
          type: "yes_no",
        },
        { ...EIN_FIELD, conditionals: [{ field: "is_business", operator: "equals", value: true, action: "show" }] },
        ...US_ADDRESS_FIELDS,
        { id: "phone", label: "Phone", type: "phone", required: true },
      ],
    },
    {
      id: "lien_details",
      title: "Lien Details",
      order: 2,
      fields: [
        {
          id: "nftl_serial_number",
          label: "Notice of Federal Tax Lien Serial Number (SLID)",
          type: "text",
          required: true,
          helpText: "The unique identifier on the filed NFTL. Format varies by IRS office.",
        },
        {
          id: "nftl_filing_date",
          label: "NFTL Filing Date",
          type: "date",
          required: true,
        },
        {
          id: "recording_jurisdiction",
          label: "Recording Jurisdiction",
          type: "text",
          required: true,
          helpText: "County and state where the NFTL is recorded.",
        },
        {
          id: "withdrawal_ground",
          label: "Statutory Ground for Withdrawal",
          type: "single_select",
          required: true,
          options: [
            { value: "prematurely_filed",    label: "The NFTL was filed prematurely or not in accordance with IRS procedures (§ 6323(j)(1)(A))" },
            { value: "installment",          label: "The taxpayer has entered into an installment agreement and the IRS determines withdrawal will facilitate collection (§ 6323(j)(1)(B))" },
            { value: "facilitates_collection", label: "Withdrawal will facilitate collection of the liability (§ 6323(j)(1)(C))" },
            { value: "best_interest",        label: "Withdrawal is in the best interest of the taxpayer and the United States (§ 6323(j)(1)(D))" },
          ],
          helpText: "Most withdrawals succeed on (j)(1)(C) — facilitates collection — for compliant taxpayers on DDIA.",
        },
        ...REASONABLE_CAUSE_FIELDS,
        {
          id: "credit_agencies_notified",
          label: "I request copies of the withdrawal notice sent to credit reporting agencies",
          type: "yes_no",
          helpText: "Checks the box on the form requesting IRS notify Equifax, Experian, and TransUnion that the lien has been withdrawn. Strongly recommended.",
        },
      ],
    },
    {
      id: "signature",
      title: "Signature",
      order: 3,
      fields: [
        ...TAXPAYER_SIGNATURE_FIELDS,
      ],
    },
  ],
}
