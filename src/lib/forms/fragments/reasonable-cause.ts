import type { FieldDef } from "../types"

// Reasonable-cause narrative structure. Used by Form 843 (penalty abatement)
// and other forms that require a written explanation of hardship, good-faith
// effort, or extenuating circumstance.
//
// The narrative is decomposed into four structured prompts that guide the
// practitioner to assemble a complete reasonable-cause argument:
//
//   1. Facts       — What actually happened (chronology).
//   2. Circumstances — Why it was outside the taxpayer's control.
//   3. Steps taken — How the taxpayer responded once aware.
//   4. Authority   — Applicable legal/regulatory citations (IRC §, IRM, cases).
//
// Downstream, these four fields render as a single cohesive narrative block
// on the PDF via a value transform that concatenates them with headers.

export const REASONABLE_CAUSE_FIELDS: FieldDef[] = [
  {
    id: "rc_facts",
    label: "Facts: What happened?",
    type: "textarea",
    required: true,
    helpText: "A clear chronology of the events that led to the noncompliance. Dates, amounts, parties involved.",
    validation: [
      { type: "min_length", value: 50, message: "Please describe the facts in more detail." },
    ],
  },
  {
    id: "rc_circumstances",
    label: "Circumstances: Why was this outside the taxpayer's control?",
    type: "textarea",
    required: true,
    helpText: "Ordinary-business-care-and-prudence analysis. Describe the extenuating circumstance (illness, disaster, reliance on professional, first-time penalty qualifier, etc.).",
    validation: [
      { type: "min_length", value: 50, message: "Please explain the circumstances in more detail." },
    ],
  },
  {
    id: "rc_steps_taken",
    label: "Steps taken: What did the taxpayer do once aware?",
    type: "textarea",
    required: true,
    helpText: "Evidence of good-faith effort to comply once the issue came to the taxpayer's attention.",
    validation: [
      { type: "min_length", value: 30, message: "Please describe the remediation steps taken." },
    ],
  },
  {
    id: "rc_authority",
    label: "Authority: Applicable citations",
    type: "textarea",
    helpText: "IRC § 6651, IRM 20.1.1, Boyle, or any other relevant authority. Optional but strengthens the argument.",
  },
]
