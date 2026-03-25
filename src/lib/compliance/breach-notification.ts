/**
 * Breach Notification System
 *
 * Provides state-by-state breach notification requirements,
 * affected state identification, and auto-drafted notification letters.
 *
 * IMPORTANT: All generated notification drafts require admin review
 * before any communications are sent. This is a drafting tool only.
 */

export interface StateNotificationLaw {
  state: string
  stateCode: string
  notificationDeadline: number // days
  agNotificationRequired: boolean
  notificationMethod: string // "written", "electronic", "both"
  contentRequirements: string[]
}

/**
 * State breach notification laws.
 * Simplified entries covering major states and key requirements.
 */
export const STATE_BREACH_LAWS: StateNotificationLaw[] = [
  {
    state: "California",
    stateCode: "CA",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Name of breach",
      "Types of data",
      "Date of breach",
      "Description of incident",
      "Toll-free numbers for credit agencies",
    ],
  },
  {
    state: "New York",
    stateCode: "NY",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Consumer protection agency contact",
    ],
  },
  {
    state: "Texas",
    stateCode: "TX",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Steps taken",
      "Contact information",
    ],
  },
  {
    state: "Florida",
    stateCode: "FL",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
      "Steps to protect against identity theft",
    ],
  },
  {
    state: "Illinois",
    stateCode: "IL",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect against identity theft",
    ],
  },
  {
    state: "Pennsylvania",
    stateCode: "PA",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Ohio",
    stateCode: "OH",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date range of breach",
      "Contact information",
    ],
  },
  {
    state: "Georgia",
    stateCode: "GA",
    notificationDeadline: 60,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "North Carolina",
    stateCode: "NC",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Steps taken",
      "Contact information",
      "Consumer protection information",
    ],
  },
  {
    state: "Michigan",
    stateCode: "MI",
    notificationDeadline: 45,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect identity",
    ],
  },
  {
    state: "New Jersey",
    stateCode: "NJ",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect against identity theft",
    ],
  },
  {
    state: "Virginia",
    stateCode: "VA",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Toll-free numbers for credit agencies",
    ],
  },
  {
    state: "Washington",
    stateCode: "WA",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "both",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
      "Toll-free numbers for credit agencies",
    ],
  },
  {
    state: "Massachusetts",
    stateCode: "MA",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Type of breach",
      "Types of data",
      "Steps taken",
      "Contact information",
      "Right to obtain police report",
      "Right to request security freeze",
    ],
  },
  {
    state: "Arizona",
    stateCode: "AZ",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
    ],
  },
  {
    state: "Colorado",
    stateCode: "CO",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
      "Information about credit monitoring",
    ],
  },
  {
    state: "Maryland",
    stateCode: "MD",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Toll-free numbers for credit agencies",
      "FTC contact information",
    ],
  },
  {
    state: "Minnesota",
    stateCode: "MN",
    notificationDeadline: 60,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect against identity theft",
    ],
  },
  {
    state: "Missouri",
    stateCode: "MO",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Indiana",
    stateCode: "IN",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect against identity theft",
    ],
  },
  {
    state: "Tennessee",
    stateCode: "TN",
    notificationDeadline: 60,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Wisconsin",
    stateCode: "WI",
    notificationDeadline: 45,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Steps to protect identity",
    ],
  },
  {
    state: "Oregon",
    stateCode: "OR",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
      "Credit reporting agency contact",
    ],
  },
  {
    state: "Connecticut",
    stateCode: "CT",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Steps taken",
      "Contact information",
    ],
  },
  {
    state: "Nevada",
    stateCode: "NV",
    notificationDeadline: 60,
    agNotificationRequired: false,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Alabama",
    stateCode: "AL",
    notificationDeadline: 45,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Date of breach",
      "Contact information",
    ],
  },
  {
    state: "South Carolina",
    stateCode: "SC",
    notificationDeadline: 30,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
      "Credit monitoring information",
    ],
  },
  {
    state: "Louisiana",
    stateCode: "LA",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Kentucky",
    stateCode: "KY",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
  {
    state: "Iowa",
    stateCode: "IA",
    notificationDeadline: 60,
    agNotificationRequired: true,
    notificationMethod: "written",
    contentRequirements: [
      "Description of incident",
      "Types of data",
      "Contact information",
    ],
  },
]

/**
 * Identify affected states from client geographic data.
 */
export function identifyAffectedStates(
  clientData: Array<{ state?: string | null }>
): string[] {
  const states = clientData
    .map((c) => c.state)
    .filter((s): s is string => !!s)
  return [...new Set(states)]
}

/**
 * Get notification requirements for affected states, sorted by most urgent deadline first.
 */
export function getNotificationRequirements(
  affectedStates: string[]
): Array<{
  state: string
  stateCode: string
  deadline: number
  agRequired: boolean
  method: string
  contentRequirements: string[]
}> {
  return affectedStates
    .map((state) => {
      const law = STATE_BREACH_LAWS.find(
        (l) => l.stateCode === state || l.state === state
      )
      return {
        state: law?.state || state,
        stateCode: law?.stateCode || state,
        deadline: law?.notificationDeadline || 60,
        agRequired: law?.agNotificationRequired || false,
        method: law?.notificationMethod || "written",
        contentRequirements: law?.contentRequirements || [
          "Description of incident",
          "Types of data",
          "Contact information",
        ],
      }
    })
    .sort((a, b) => a.deadline - b.deadline)
}

/**
 * Calculate the earliest notification deadline across all affected states.
 */
export function getEarliestDeadline(
  affectedStates: string[],
  incidentDate: Date
): {
  state: string
  deadlineDays: number
  deadlineDate: Date
} {
  const requirements = getNotificationRequirements(affectedStates)

  if (requirements.length === 0) {
    return {
      state: "N/A",
      deadlineDays: 60,
      deadlineDate: new Date(
        incidentDate.getTime() + 60 * 24 * 60 * 60 * 1000
      ),
    }
  }

  const earliest = requirements[0] // Already sorted by deadline
  return {
    state: earliest.state,
    deadlineDays: earliest.deadline,
    deadlineDate: new Date(
      incidentDate.getTime() + earliest.deadline * 24 * 60 * 60 * 1000
    ),
  }
}

/**
 * Generate an auto-drafted notification letter for a specific state.
 * The draft MUST be reviewed by an admin before sending.
 */
export function generateNotificationDraft(
  incidentDetails: {
    description: string
    dataTypes: string[]
    detectedAt: Date
    playbookSteps?: Array<{
      description: string
      status: string
    }>
  },
  stateCode: string,
  affectedCount: number
): string {
  const law = STATE_BREACH_LAWS.find((l) => l.stateCode === stateCode)
  const detectedDate = incidentDetails.detectedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const completedSteps = incidentDetails.playbookSteps
    ?.filter((s) => s.status === "completed")
    .map((s) => s.description)
    .join("\n  - ") || "Investigation is ongoing"

  const dataTypesText = incidentDetails.dataTypes.length > 0
    ? incidentDetails.dataTypes.join(", ")
    : "[TO BE DETERMINED — list specific data types affected]"

  return `[AUTO-DRAFTED — REQUIRES ADMIN REVIEW BEFORE SENDING]
[State: ${law?.state || stateCode} | Deadline: ${law?.notificationDeadline || 60} days | AG Notification: ${law?.agNotificationRequired ? "Required" : "Not required"}]
[Affected individuals: ${affectedCount}]

Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Re: Notice of Data Security Incident

Dear [Individual Name],

We are writing to inform you of a data security incident that may have affected your personal information.

WHAT HAPPENED
${incidentDetails.description}

The incident was detected on ${detectedDate}.

WHAT INFORMATION WAS INVOLVED
The information that may have been affected includes: ${dataTypesText}

WHAT WE ARE DOING
Upon discovering the incident, we immediately took the following steps:
  - ${completedSteps}

WHAT YOU CAN DO
We recommend that you take the following precautionary steps:
  - Monitor your financial accounts and credit reports for unusual activity
  - Consider placing a fraud alert or security freeze on your credit files
  - Be cautious of unsolicited communications asking for personal information
  - Review your IRS account for any unauthorized activity at irs.gov

You may contact the three major credit reporting agencies:
  - Equifax: 1-800-685-1111
  - Experian: 1-888-397-3742
  - TransUnion: 1-800-680-7289

You may also file a complaint with the Federal Trade Commission:
  - Online: ftc.gov/complaint
  - Phone: 1-877-438-4338

CONTACT INFORMATION
If you have questions about this incident, please contact us at:
  [Firm Name]
  [Address]
  [Phone Number]
  [Email]

${law?.contentRequirements.map((r) => `[REQUIRED BY ${stateCode} LAW: ${r}]`).join("\n") || ""}

Sincerely,
[Firm Name]
[Compliance Officer Name and Title]`
}

/**
 * Generate a summary of all notification requirements for an incident.
 */
export function generateNotificationSummary(
  affectedStates: string[],
  incidentDate: Date
): string {
  const requirements = getNotificationRequirements(affectedStates)
  const earliest = getEarliestDeadline(affectedStates, incidentDate)

  let summary = `BREACH NOTIFICATION REQUIREMENTS SUMMARY
==========================================
Incident Date: ${incidentDate.toLocaleDateString()}
States Affected: ${affectedStates.length}
Earliest Deadline: ${earliest.deadlineDate.toLocaleDateString()} (${earliest.state}, ${earliest.deadlineDays} days)

STATE-BY-STATE REQUIREMENTS:
`

  for (const req of requirements) {
    const deadlineDate = new Date(
      incidentDate.getTime() + req.deadline * 24 * 60 * 60 * 1000
    )
    summary += `
${req.state} (${req.stateCode})
  Deadline: ${req.deadline} days (${deadlineDate.toLocaleDateString()})
  AG Notification: ${req.agRequired ? "REQUIRED" : "Not required"}
  Method: ${req.method}
  Content Requirements: ${req.contentRequirements.join("; ")}
`
  }

  return summary
}
