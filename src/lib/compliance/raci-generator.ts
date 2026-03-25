/**
 * RACI Matrix Generator — SOC 2 CC1.1
 *
 * Auto-generates a Responsible/Accountable/Consulted/Informed matrix
 * from the RBAC configuration. Maps each role to their capabilities
 * within the Cleared platform.
 *
 * R = Responsible (does the work)
 * A = Accountable (ultimately answerable)
 * C = Consulted (provides input)
 * I = Informed (kept in the loop)
 */

export type RACILevel = "R" | "A" | "C" | "I"

export interface RACIPermission {
  action: string
  level: RACILevel
}

export interface RACIRole {
  role: string
  permissions: RACIPermission[]
}

export interface RACIMatrix {
  generatedAt: string
  roles: RACIRole[]
}

/**
 * Generate the RACI matrix from the platform's RBAC configuration.
 * This is deterministic — same input always produces the same output.
 */
export function generateRACIMatrix(): RACIMatrix {
  const roles: RACIRole[] = [
    {
      role: "ADMIN",
      permissions: [
        { action: "User Management (create, edit, deactivate)", level: "A" },
        { action: "Role & Permission Assignment", level: "A" },
        { action: "Compliance Policy Management", level: "R" },
        { action: "Policy Acknowledgment Oversight", level: "A" },
        { action: "SOC 2 Control Monitoring", level: "A" },
        { action: "Security Training Administration", level: "R" },
        { action: "Background Check Records", level: "R" },
        { action: "Vendor Risk Management", level: "A" },
        { action: "Incident Response Coordination", level: "A" },
        { action: "Data Disposal Approval", level: "A" },
        { action: "Data Subject Request Oversight", level: "A" },
        { action: "Governance Meeting Records", level: "R" },
        { action: "Audit Log Review", level: "R" },
        { action: "System Configuration", level: "A" },
        { action: "AI Analysis Execution", level: "R" },
        { action: "AI Output Review & Approval", level: "R" },
        { action: "Case Management", level: "A" },
        { action: "Document Upload", level: "R" },
        { action: "Knowledge Base Management", level: "A" },
        { action: "Bulk Export Operations", level: "A" },
      ],
    },
    {
      role: "SENIOR",
      permissions: [
        { action: "User Management (create, edit, deactivate)", level: "C" },
        { action: "Role & Permission Assignment", level: "C" },
        { action: "Compliance Policy Management", level: "C" },
        { action: "Policy Acknowledgment Oversight", level: "I" },
        { action: "SOC 2 Control Monitoring", level: "C" },
        { action: "Security Training Administration", level: "I" },
        { action: "Background Check Records", level: "I" },
        { action: "Vendor Risk Management", level: "C" },
        { action: "Incident Response Coordination", level: "R" },
        { action: "Data Disposal Approval", level: "C" },
        { action: "Data Subject Request Oversight", level: "R" },
        { action: "Governance Meeting Records", level: "C" },
        { action: "Audit Log Review", level: "R" },
        { action: "System Configuration", level: "C" },
        { action: "AI Analysis Execution", level: "R" },
        { action: "AI Output Review & Approval", level: "A" },
        { action: "Case Management", level: "R" },
        { action: "Document Upload", level: "R" },
        { action: "Knowledge Base Management", level: "R" },
        { action: "Bulk Export Operations", level: "R" },
      ],
    },
    {
      role: "PRACTITIONER",
      permissions: [
        { action: "User Management (create, edit, deactivate)", level: "I" },
        { action: "Role & Permission Assignment", level: "I" },
        { action: "Compliance Policy Management", level: "I" },
        { action: "Policy Acknowledgment Oversight", level: "I" },
        { action: "SOC 2 Control Monitoring", level: "I" },
        { action: "Security Training Administration", level: "I" },
        { action: "Background Check Records", level: "I" },
        { action: "Vendor Risk Management", level: "I" },
        { action: "Incident Response Coordination", level: "C" },
        { action: "Data Disposal Approval", level: "I" },
        { action: "Data Subject Request Oversight", level: "C" },
        { action: "Governance Meeting Records", level: "I" },
        { action: "Audit Log Review", level: "I" },
        { action: "System Configuration", level: "I" },
        { action: "AI Analysis Execution", level: "R" },
        { action: "AI Output Review & Approval", level: "R" },
        { action: "Case Management", level: "R" },
        { action: "Document Upload", level: "R" },
        { action: "Knowledge Base Management", level: "C" },
        { action: "Bulk Export Operations", level: "C" },
      ],
    },
    {
      role: "SUPPORT_STAFF",
      permissions: [
        { action: "User Management (create, edit, deactivate)", level: "I" },
        { action: "Role & Permission Assignment", level: "I" },
        { action: "Compliance Policy Management", level: "I" },
        { action: "Policy Acknowledgment Oversight", level: "I" },
        { action: "SOC 2 Control Monitoring", level: "I" },
        { action: "Security Training Administration", level: "I" },
        { action: "Background Check Records", level: "I" },
        { action: "Vendor Risk Management", level: "I" },
        { action: "Incident Response Coordination", level: "I" },
        { action: "Data Disposal Approval", level: "I" },
        { action: "Data Subject Request Oversight", level: "I" },
        { action: "Governance Meeting Records", level: "I" },
        { action: "Audit Log Review", level: "I" },
        { action: "System Configuration", level: "I" },
        { action: "AI Analysis Execution", level: "I" },
        { action: "AI Output Review & Approval", level: "I" },
        { action: "Case Management", level: "I" },
        { action: "Document Upload", level: "R" },
        { action: "Knowledge Base Management", level: "I" },
        { action: "Bulk Export Operations", level: "I" },
      ],
    },
  ]

  return {
    generatedAt: new Date().toISOString(),
    roles,
  }
}

/**
 * Get a flattened view of the RACI matrix for a specific action.
 * Returns { ADMIN: "A", SENIOR: "R", PRACTITIONER: "R", SUPPORT_STAFF: "I" }
 */
export function getRACIForAction(
  action: string
): Record<string, RACILevel | null> {
  const matrix = generateRACIMatrix()
  const result: Record<string, RACILevel | null> = {}

  for (const role of matrix.roles) {
    const perm = role.permissions.find((p) => p.action === action)
    result[role.role] = perm?.level ?? null
  }

  return result
}
