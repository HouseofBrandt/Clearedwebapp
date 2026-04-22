import type { FieldDef } from "../types"

// Standard signature block used across almost every IRS form. Includes
// taxpayer signature + date, spouse signature + date (for MFJ forms),
// and title (for business forms where an officer signs).
//
// Signature itself is a date-stamped attestation in this system; the
// practitioner prints the form, the taxpayer ink-signs, the signed copy
// is scanned back in as a Document. We do not support e-signature in v1.

export const TAXPAYER_SIGNATURE_FIELDS: FieldDef[] = [
  {
    id: "taxpayer_signature_name",
    label: "Taxpayer Signature (printed)",
    type: "text",
    required: true,
    irsReference: "Signature block",
    helpText: "The taxpayer's printed name. The form will be printed for ink signature.",
  },
  {
    id: "taxpayer_signature_date",
    label: "Signature Date",
    type: "date",
    required: true,
    irsReference: "Signature block",
  },
]

export const SPOUSE_SIGNATURE_FIELDS: FieldDef[] = [
  {
    id: "spouse_signature_name",
    label: "Spouse Signature (printed)",
    type: "text",
    irsReference: "Spouse signature block",
    helpText: "Required for forms filed jointly (MFJ).",
    conditionals: [
      { field: "filing_status", operator: "equals", value: "MFJ", action: "show" },
    ],
  },
  {
    id: "spouse_signature_date",
    label: "Spouse Signature Date",
    type: "date",
    irsReference: "Spouse signature block",
    conditionals: [
      { field: "filing_status", operator: "equals", value: "MFJ", action: "show" },
    ],
  },
]

export const OFFICER_TITLE_FIELD: FieldDef = {
  id: "officer_title",
  label: "Title (if signing on behalf of a business)",
  type: "text",
  irsReference: "Signature block",
  helpText: "E.g., President, Managing Member, Partner.",
}

// Penalties of perjury jurat — the standard IRS attestation that appears
// above the signature block on most forms. Rendered as a computed/read-only
// display in the wizard; the PDF already contains the jurat text, so this
// is informational for the preparer.
export const JURAT_NOTICE: FieldDef = {
  id: "jurat_acknowledged",
  label: "I understand the penalties-of-perjury declaration",
  type: "yes_no",
  required: true,
  helpText: "Under penalties of perjury, I declare that I have examined this form, including accompanying schedules and statements, and to the best of my knowledge and belief it is true, correct, and complete.",
}
