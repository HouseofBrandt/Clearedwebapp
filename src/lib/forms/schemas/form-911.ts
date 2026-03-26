import { FormSchema } from "../types"

export const FORM_911: FormSchema = {
  formNumber: "911",
  formTitle: "Request for Taxpayer Advocate Service Assistance",
  revisionDate: "February 2024",
  ombNumber: "1545-1504",
  totalSections: 4,
  estimatedMinutes: 25,
  resolutionMetadata: {
    resolutionPaths: ["advocate"],
    requirementLevel: { advocate: "required" },
    dependsOn: ["2848"],
    requiredBy: [],
    dataSources: [],
    dataTargets: [],
  },
  sections: [
    // ── Section 1: Taxpayer Information ──────────────────────────────────
    {
      id: "taxpayer_info",
      title: "Taxpayer Information",
      description: "Identifying and contact information for the taxpayer",
      order: 1,
      fields: [
        {
          id: "taxpayer_name",
          label: "Taxpayer Name",
          type: "text",
          required: true,
          irsReference: "Line 1a",
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
          irsReference: "Line 1b",
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
          irsReference: "Line 2",
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
          required: true,
          irsReference: "Line 3",
        },
        {
          id: "email",
          label: "Email Address",
          type: "text",
          irsReference: "Line 4",
          validation: [
            {
              type: "pattern",
              value: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
              message: "Invalid email format",
            },
          ],
        },
        {
          id: "spouse_name",
          label: "Spouse Name (if applicable)",
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
          id: "tax_form_number",
          label: "Tax Form Number",
          type: "text",
          irsReference: "Line 6",
          helpText: "The type of tax return involved (e.g., 1040, 941).",
          placeholder: "e.g., 1040",
        },
        {
          id: "tax_periods",
          label: "Tax Year(s) or Period(s)",
          type: "repeating_group",
          irsReference: "Line 7",
          minGroups: 1,
          maxGroups: 10,
          groupFields: [
            {
              id: "period_year",
              label: "Tax Year / Period",
              type: "text",
              required: true,
              placeholder: "e.g., 2022",
            },
          ],
        },
      ],
    },

    // ── Section 2: Representative Information ───────────────────────────
    {
      id: "representative_info",
      title: "Representative Information",
      description:
        "Information about the taxpayer's authorized representative, if any",
      order: 2,
      fields: [
        {
          id: "has_representative",
          label: "Do you have an authorized representative?",
          type: "yes_no",
          irsReference: "Line 8",
        },
        {
          id: "rep_name",
          label: "Representative Name",
          type: "text",
          irsReference: "Line 9a",
          conditionals: [
            {
              field: "has_representative",
              operator: "equals",
              value: true,
              action: "show",
            },
          ],
        },
        {
          id: "rep_phone",
          label: "Representative Phone",
          type: "phone",
          irsReference: "Line 9b",
          conditionals: [
            {
              field: "has_representative",
              operator: "equals",
              value: true,
              action: "show",
            },
          ],
        },
        {
          id: "rep_caf",
          label: "CAF Number",
          type: "text",
          irsReference: "Line 9c",
          helpText: "Centralized Authorization File number from Form 2848.",
          conditionals: [
            {
              field: "has_representative",
              operator: "equals",
              value: true,
              action: "show",
            },
          ],
        },
        {
          id: "rep_centralized_auth",
          label: "Is Form 2848 (Power of Attorney) on file with the IRS?",
          type: "yes_no",
          irsReference: "Line 10",
          helpText:
            "A valid Form 2848 must be on file for TAS to communicate with your representative.",
          conditionals: [
            {
              field: "has_representative",
              operator: "equals",
              value: true,
              action: "show",
            },
          ],
        },
      ],
    },

    // ── Section 3: IRS Contact Information ──────────────────────────────
    {
      id: "irs_contact",
      title: "IRS Contact Information",
      description:
        "Details about prior contacts with the IRS regarding this issue",
      irsInstructions:
        "Provide information about the IRS employee or office you have contacted about this problem.",
      order: 3,
      fields: [
        {
          id: "irs_employee_name",
          label: "IRS Employee Name",
          type: "text",
          irsReference: "Line 11a",
          helpText: "Name of the IRS employee you spoke with or corresponded with.",
        },
        {
          id: "irs_employee_id",
          label: "IRS Employee ID Number",
          type: "text",
          irsReference: "Line 11b",
          helpText: "The badge or ID number of the IRS employee, if available.",
        },
        {
          id: "irs_office",
          label: "IRS Office / Function",
          type: "text",
          irsReference: "Line 11c",
          helpText:
            "The IRS office, campus, or function you contacted (e.g., Automated Collection System, Examination).",
        },
        {
          id: "contact_date",
          label: "Date of Contact",
          type: "date",
          irsReference: "Line 11d",
          helpText: "The most recent date you contacted or were contacted by the IRS.",
        },
        {
          id: "irs_response",
          label: "IRS Response / Actions Taken",
          type: "textarea",
          irsReference: "Line 12",
          helpText:
            "Describe what the IRS said or did in response to your inquiry.",
          placeholder:
            "Describe the IRS's response, any actions taken, or the lack of response...",
        },
      ],
    },

    // ── Section 4: Description of Problem & Relief Requested ────────────
    {
      id: "problem_relief",
      title: "Description of Problem & Relief Requested",
      description:
        "Detailed description of the tax problem, hardship, and relief sought",
      irsInstructions:
        "Explain your tax problem in detail. Describe how it is causing you financial difficulty or other hardship, what you have done to try to resolve it, and what specific relief you are requesting.",
      order: 4,
      fields: [
        {
          id: "hardship_category",
          label: "Hardship Category",
          type: "single_select",
          required: true,
          irsReference: "Line 13",
          helpText:
            "Select the category that best describes the basis for your TAS request.",
          options: [
            {
              value: "significant_hardship",
              label:
                "IRS action or inaction has caused or will cause significant hardship",
            },
            {
              value: "immediate_threat",
              label:
                "You are facing an immediate threat of adverse action",
            },
            {
              value: "irreparable_injury",
              label:
                "You will suffer irreparable injury or long-term adverse impact",
            },
            {
              value: "delay_30_days",
              label:
                "You have experienced a delay of more than 30 days",
            },
            {
              value: "no_response_by_date",
              label:
                "You have not received a response by the date promised",
            },
            {
              value: "system_failure",
              label:
                "A system or procedure has failed to operate as intended",
            },
          ],
        },
        {
          id: "problem_description",
          label: "Description of the Tax Problem",
          type: "textarea",
          required: true,
          irsReference: "Line 14",
          helpText:
            "Provide a detailed description of the tax problem. Include dates, amounts, and specifics.",
          placeholder:
            "Describe the tax problem in detail, including what happened, when it happened, and the amounts involved...",
        },
        {
          id: "attempts_to_resolve",
          label: "Prior Attempts to Resolve",
          type: "textarea",
          required: true,
          irsReference: "Line 15",
          helpText:
            "Describe all steps you have taken to resolve this issue through normal IRS channels.",
          placeholder:
            "List each attempt to resolve this issue: dates of calls, letters sent, IRS offices visited, etc...",
        },
        {
          id: "relief_requested",
          label: "Specific Relief Requested",
          type: "textarea",
          required: true,
          irsReference: "Line 16",
          helpText:
            "State the specific action you want the Taxpayer Advocate to take on your behalf.",
          placeholder:
            "Describe exactly what relief or action you are requesting from the Taxpayer Advocate Service...",
        },
        {
          id: "hardship_explanation",
          label: "Hardship Explanation",
          type: "textarea",
          required: true,
          irsReference: "Line 17",
          helpText:
            "Explain how the tax problem is causing financial difficulty or other hardship.",
          placeholder:
            "Explain the financial, medical, or personal hardship caused by this tax problem. Include specific impacts on your ability to pay essential living expenses...",
        },
        {
          id: "supporting_documents",
          label: "List of Supporting Documents",
          type: "textarea",
          irsReference: "Line 18",
          helpText:
            "List all documents you are attaching or have previously submitted to support your request.",
          placeholder:
            "e.g., IRS notices, bank statements, medical records, proof of payments, prior correspondence with IRS...",
        },
      ],
    },
  ],
  crossFieldValidations: [
    {
      id: "rep_auth_check",
      description:
        "If a representative is listed, Form 2848 should be on file",
      fields: ["has_representative", "rep_centralized_auth"],
      rule: "has_representative !== true || rep_centralized_auth === true",
      errorMessage:
        "A Form 2848 (Power of Attorney) should be on file with the IRS for TAS to work with your representative. Consider filing Form 2848 first.",
      severity: "warning",
    },
  ],
}
