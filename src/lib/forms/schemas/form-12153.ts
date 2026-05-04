import { FormSchema } from "../types"

export const FORM_12153: FormSchema = {
  formNumber: "12153",
  formTitle: "Request for a Collection Due Process or Equivalent Hearing",
  revisionDate: "December 2023",
  ombNumber: "1545-1899",
  totalSections: 3,
  estimatedMinutes: 20,
  resolutionMetadata: {
    resolutionPaths: ["cdp"],
    requirementLevel: { cdp: "required" },
    dependsOn: ["2848"],
    requiredBy: [],
    dataSources: [],
    dataTargets: [],
  },
  crossFormMappings: [
    {
      sourceFormNumber: "433-A",
      fieldMap: {
        taxpayer_name:   "taxpayer_name",
        ssn:             "ssn",
        spouse_name:     "spouse_name",
        spouse_ssn:      "spouse_ssn",
        address_street:  "address_street",
        address_city:    "address_city",
        address_state:   "address_state",
        address_zip:     "address_zip",
        home_phone:      "phone",
      },
    },
    {
      sourceFormNumber: "2848",
      fieldMap: {
        // Pull representative info from the firm-wide POA — the practitioner
        // listed on 2848 is the same one filing the CDP request.
        "representatives.0.rep_name":       "representative_name",
        "representatives.0.rep_phone":      "representative_phone",
        "representatives.0.rep_caf_number": "caf_number",
      },
    },
  ],
  sections: [
    // ── Section 1: Taxpayer Information ──────────────────────────────────
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      description:
        "Identifying information for the taxpayer and authorized representative",
      order: 1,
      fields: [
        {
          id: "taxpayer_name",
          label: "Taxpayer Name",
          type: "text",
          required: true,
          irsReference: "Line 1",
          validation: [
            { type: "required", message: "Taxpayer name is required" },
            { type: "max_length", value: 100, message: "Name too long" },
          ],
        },
        {
          id: "ssn",
          label: "Social Security Number",
          type: "ssn",
          required: true,
          irsReference: "Line 2",
          validation: [
            { type: "required", message: "SSN is required" },
            {
              type: "pattern",
              value: "^\\d{3}-?\\d{2}-?\\d{4}$",
              message: "Invalid SSN format",
            },
          ],
        },
        {
          id: "address_street",
          label: "Street Address",
          type: "text",
          required: true,
          irsReference: "Line 3",
        },
        {
          id: "address_city",
          label: "City",
          type: "text",
          required: true,
        },
        {
          id: "address_state",
          label: "State",
          type: "single_select",
          required: true,
          options: [
            { value: "AL", label: "Alabama" },
            { value: "AK", label: "Alaska" },
            { value: "AZ", label: "Arizona" },
            { value: "AR", label: "Arkansas" },
            { value: "CA", label: "California" },
            { value: "CO", label: "Colorado" },
            { value: "CT", label: "Connecticut" },
            { value: "DE", label: "Delaware" },
            { value: "DC", label: "District of Columbia" },
            { value: "FL", label: "Florida" },
            { value: "GA", label: "Georgia" },
            { value: "HI", label: "Hawaii" },
            { value: "ID", label: "Idaho" },
            { value: "IL", label: "Illinois" },
            { value: "IN", label: "Indiana" },
            { value: "IA", label: "Iowa" },
            { value: "KS", label: "Kansas" },
            { value: "KY", label: "Kentucky" },
            { value: "LA", label: "Louisiana" },
            { value: "ME", label: "Maine" },
            { value: "MD", label: "Maryland" },
            { value: "MA", label: "Massachusetts" },
            { value: "MI", label: "Michigan" },
            { value: "MN", label: "Minnesota" },
            { value: "MS", label: "Mississippi" },
            { value: "MO", label: "Missouri" },
            { value: "MT", label: "Montana" },
            { value: "NE", label: "Nebraska" },
            { value: "NV", label: "Nevada" },
            { value: "NH", label: "New Hampshire" },
            { value: "NJ", label: "New Jersey" },
            { value: "NM", label: "New Mexico" },
            { value: "NY", label: "New York" },
            { value: "NC", label: "North Carolina" },
            { value: "ND", label: "North Dakota" },
            { value: "OH", label: "Ohio" },
            { value: "OK", label: "Oklahoma" },
            { value: "OR", label: "Oregon" },
            { value: "PA", label: "Pennsylvania" },
            { value: "RI", label: "Rhode Island" },
            { value: "SC", label: "South Carolina" },
            { value: "SD", label: "South Dakota" },
            { value: "TN", label: "Tennessee" },
            { value: "TX", label: "Texas" },
            { value: "UT", label: "Utah" },
            { value: "VT", label: "Vermont" },
            { value: "VA", label: "Virginia" },
            { value: "WA", label: "Washington" },
            { value: "WV", label: "West Virginia" },
            { value: "WI", label: "Wisconsin" },
            { value: "WY", label: "Wyoming" },
          ],
        },
        {
          id: "address_zip",
          label: "ZIP Code",
          type: "text",
          required: true,
          validation: [
            {
              type: "pattern",
              value: "^\\d{5}(-\\d{4})?$",
              message: "Invalid ZIP code",
            },
          ],
        },
        {
          id: "phone",
          label: "Phone Number",
          type: "phone",
          irsReference: "Line 4",
        },
        {
          id: "spouse_name",
          label: "Spouse Name (if joint liability)",
          type: "text",
          irsReference: "Line 5a",
        },
        {
          id: "spouse_ssn",
          label: "Spouse SSN",
          type: "ssn",
          irsReference: "Line 5b",
          conditionals: [
            {
              field: "spouse_name",
              operator: "is_not_empty",
              value: null,
              action: "show",
            },
          ],
        },
        {
          id: "representative_name",
          label: "Authorized Representative Name",
          type: "text",
          irsReference: "Line 6a",
          helpText:
            "Name of the representative authorized via Form 2848 (Power of Attorney).",
        },
        {
          id: "representative_phone",
          label: "Representative Phone",
          type: "phone",
          irsReference: "Line 6b",
          conditionals: [
            {
              field: "representative_name",
              operator: "is_not_empty",
              value: null,
              action: "show",
            },
          ],
        },
        {
          id: "caf_number",
          label: "CAF Number",
          type: "text",
          irsReference: "Line 6c",
          helpText: "Centralized Authorization File number from Form 2848.",
          conditionals: [
            {
              field: "representative_name",
              operator: "is_not_empty",
              value: null,
              action: "show",
            },
          ],
        },
      ],
    },

    // ── Section 2: Collection Action & Tax Periods ──────────────────────
    {
      id: "collection_action",
      title: "Collection Action & Tax Periods",
      description:
        "Identify the collection action being challenged and the tax periods involved",
      irsInstructions:
        "Check the type of IRS collection action you received notice of, and list all tax periods involved.",
      order: 2,
      fields: [
        {
          id: "collection_action_type",
          label: "Type of Collection Action",
          type: "multi_select",
          required: true,
          irsReference: "Line 7",
          helpText: "Select all types of collection actions identified in the IRS notice.",
          options: [
            { value: "lien", label: "Lien filing" },
            { value: "levy", label: "Levy or seizure" },
            { value: "both", label: "Both" },
          ],
        },
        {
          id: "tax_periods",
          label: "Tax Periods at Issue",
          type: "repeating_group",
          required: true,
          irsReference: "Line 8",
          minGroups: 1,
          maxGroups: 20,
          groupFields: [
            {
              id: "period_year",
              label: "Tax Year / Period",
              type: "text",
              required: true,
              placeholder: "e.g., 2022",
            },
            {
              id: "period_tax_type",
              label: "Tax Type (Form Number)",
              type: "single_select",
              required: true,
              options: [
                { value: "1040", label: "1040 — Individual Income Tax" },
                { value: "941", label: "941 — Employer Quarterly" },
                { value: "940", label: "940 — Federal Unemployment" },
                { value: "1120", label: "1120 — Corporate Income Tax" },
                { value: "1065", label: "1065 — Partnership Return" },
                { value: "other", label: "Other" },
              ],
            },
            {
              id: "period_amount",
              label: "Amount Owed",
              type: "currency",
              required: true,
            },
          ],
        },
        {
          id: "irs_notice_number",
          label: "IRS Notice Number",
          type: "text",
          irsReference: "Line 9",
          helpText:
            "The notice number from the IRS letter (e.g., LT11, CP504, L1058).",
        },
        {
          id: "notice_date",
          label: "Date of IRS Notice",
          type: "date",
          required: true,
          irsReference: "Line 10",
          helpText: "The date printed on the IRS collection notice.",
        },
        {
          id: "filing_deadline",
          label: "Filing Deadline (30 days from notice)",
          type: "date",
          helpText:
            "30 days from the date on your levy/lien notice. Enter the computed deadline. CDP hearing requests must be filed within 30 days of the notice date. After 30 days, only an Equivalent Hearing is available.",
          irsReference: "Computed",
        },
        {
          id: "is_timely",
          label: "Is this filing timely for CDP?",
          type: "yes_no",
          helpText:
            "Is today's date before the 30-day filing deadline?",
        },
        {
          id: "hearing_type",
          label: "Hearing Type Requested",
          type: "single_select",
          required: true,
          irsReference: "Line 11",
          helpText:
            "CDP Hearing preserves Tax Court rights; Equivalent Hearing does not.",
          options: [
            {
              value: "cdp",
              label: "CDP Hearing (within 30 days of notice)",
            },
            {
              value: "equivalent",
              label: "Equivalent Hearing (after 30 days)",
            },
          ],
        },
      ],
    },

    // ── Section 3: Proposed Resolution & Reasons ────────────────────────
    {
      id: "resolution_reasons",
      title: "Proposed Resolution & Reasons for Disagreement",
      description:
        "State the collection alternative you propose and explain why you disagree with the action",
      irsInstructions:
        "Check all proposed collection alternatives and provide a detailed explanation of why you disagree with the collection action.",
      order: 3,
      fields: [
        {
          id: "proposed_resolution",
          label: "Proposed Collection Alternative(s)",
          type: "multi_select",
          required: true,
          irsReference: "Line 12",
          helpText:
            "Select all collection alternatives you want the IRS to consider.",
          options: [
            { value: "ia", label: "Installment Agreement" },
            { value: "oic", label: "Offer in Compromise" },
            { value: "cnc", label: "Currently Not Collectible" },
            {
              value: "lien_action",
              label: "Lien Discharge/Subordination/Withdrawal",
            },
            { value: "already_paid", label: "I have already paid this liability" },
            { value: "not_owed", label: "The liability is not owed" },
            { value: "other", label: "Other" },
          ],
        },
        {
          id: "other_resolution_details",
          label: "Other Resolution Details",
          type: "textarea",
          placeholder:
            "Describe the alternative resolution you are proposing...",
          conditionals: [
            {
              field: "proposed_resolution",
              operator: "contains",
              value: "other",
              action: "show",
            },
          ],
        },
        {
          id: "disagreement_reasons",
          label: "Reasons for Disagreement",
          type: "textarea",
          required: true,
          irsReference: "Line 13",
          helpText:
            "Explain in detail why you disagree with the IRS collection action. Include all relevant facts and legal arguments.",
          placeholder:
            "Describe why the collection action is inappropriate, why you disagree with the balance, or why alternative resolution is warranted...",
        },
        {
          id: "additional_information",
          label: "Additional Information / Supporting Facts",
          type: "textarea",
          irsReference: "Line 14",
          helpText:
            "Provide any additional facts, circumstances, or information that supports your position.",
          placeholder:
            "Include any additional details about your financial situation, prior IRS contacts, compliance history, or other relevant information...",
        },
      ],
    },
  ],
  crossFieldValidations: [
    {
      id: "timely_cdp_check",
      description:
        "If CDP hearing is selected, the filing must be within the 30-day window",
      fields: ["hearing_type", "is_timely"],
      rule: 'hearing_type !== "cdp" || is_timely === true',
      errorMessage:
        "CDP hearing selected but the 30-day filing deadline has passed. Consider selecting Equivalent Hearing instead.",
      severity: "warning",
    },
    {
      id: "resolution_required",
      description: "At least one proposed resolution must be selected",
      fields: ["proposed_resolution"],
      rule: "proposed_resolution && proposed_resolution.length > 0",
      errorMessage: "You must select at least one proposed collection alternative.",
      severity: "error",
    },
  ],
}
