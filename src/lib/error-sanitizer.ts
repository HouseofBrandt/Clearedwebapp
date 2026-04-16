/**
 * Sanitize error responses to prevent information leakage.
 * In production, returns generic messages. In development, returns full details.
 */

export function sanitizeErrorResponse(error: any): { message: string; code?: string } {
  if (process.env.NODE_ENV !== "production") {
    return { message: error?.message || "Unknown error", code: error?.code }
  }

  // Map known error types to safe messages
  if (error?.code === "P2002") return { message: "A record with this information already exists.", code: "DUPLICATE" }
  if (error?.code === "P2025") return { message: "The requested record was not found.", code: "NOT_FOUND" }
  if (error?.code === "P2003") return { message: "This operation references data that does not exist.", code: "REFERENCE_ERROR" }
  if (error?.message?.includes("Unauthorized")) return { message: "Authentication required.", code: "UNAUTHORIZED" }
  if (error?.message?.includes("Forbidden")) return { message: "You do not have permission for this action.", code: "FORBIDDEN" }

  // Generic fallback — never expose internals
  return { message: "An unexpected error occurred. Please try again or contact support.", code: "INTERNAL_ERROR" }
}

/**
 * Sanitize error data before sending to Sentry.
 * Recursively strips PII from error context, including nested objects and arrays.
 */
const PII_KEYS = ["clientname", "ssn", "tin", "ein", "address", "phone", "email", "accountnumber", "routingnumber", "dob", "dateofbirth", "bankaccount", "taxid"]

export function sanitizeForSentry(data: Record<string, any>, depth = 0): Record<string, any> {
  if (depth > 10) return data // prevent infinite recursion
  const sanitized = { ...data }
  for (const key of Object.keys(sanitized)) {
    if (PII_KEYS.some(pk => key.toLowerCase().includes(pk))) {
      sanitized[key] = "[REDACTED]"
    } else if (sanitized[key] && typeof sanitized[key] === "object" && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeForSentry(sanitized[key], depth + 1)
    } else if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map((item: any) =>
        item && typeof item === "object" ? sanitizeForSentry(item, depth + 1) : item
      )
    }
  }
  return sanitized
}
