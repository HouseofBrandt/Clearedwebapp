import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFormSchema } from "@/lib/forms/registry"
import { readInstance, writeInstance } from "../route"

/**
 * GET /api/forms/[instanceId]
 * Get a form instance with its current values
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const instance = await readInstance(params.instanceId)
    if (!instance) {
      return NextResponse.json({ error: "Form instance not found" }, { status: 404 })
    }

    // Also return the schema for the form
    const schema = getFormSchema(instance.formNumber)

    return NextResponse.json({ instance, schema })
  } catch (error) {
    console.error("Error reading form instance:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/forms/[instanceId]
 * Update field values (auto-save endpoint)
 * Body: { values: Record<string, any>, status?: string, completedSections?: string[] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const instance = await readInstance(params.instanceId)
    if (!instance) {
      return NextResponse.json({ error: "Form instance not found" }, { status: 404 })
    }

    const body = await request.json()
    const { values, status, completedSections } = body

    // Merge new values with existing values
    if (values && typeof values === "object") {
      instance.values = { ...instance.values, ...values }
    }

    // Update status if provided
    if (status && ["draft", "in_progress", "complete", "submitted"].includes(status)) {
      instance.status = status as typeof instance.status
    }

    // Update completed sections if provided
    if (completedSections && Array.isArray(completedSections)) {
      instance.completedSections = completedSections
    }

    // Auto-advance status from draft to in_progress when values are saved
    if (instance.status === "draft" && values && Object.keys(values).length > 0) {
      instance.status = "in_progress"
    }

    // Run basic validation
    const schema = getFormSchema(instance.formNumber)
    if (schema) {
      const errors: Record<string, string[]> = {}
      for (const section of schema.sections) {
        for (const field of section.fields) {
          const fieldErrors: string[] = []
          const value = instance.values[field.id]

          // Check required fields (only if section is marked complete)
          if (
            field.required &&
            instance.completedSections.includes(section.id) &&
            (value === undefined || value === null || value === "")
          ) {
            fieldErrors.push(`${field.label} is required`)
          }

          // Check validation rules
          if (field.validation && value !== undefined && value !== null && value !== "") {
            for (const rule of field.validation) {
              switch (rule.type) {
                case "pattern": {
                  const regex = new RegExp(rule.value)
                  if (!regex.test(String(value))) {
                    fieldErrors.push(rule.message)
                  }
                  break
                }
                case "max_length": {
                  if (String(value).length > rule.value) {
                    fieldErrors.push(rule.message)
                  }
                  break
                }
                case "min_length": {
                  if (String(value).length < rule.value) {
                    fieldErrors.push(rule.message)
                  }
                  break
                }
                case "min": {
                  if (Number(value) < rule.value) {
                    fieldErrors.push(rule.message)
                  }
                  break
                }
                case "max": {
                  if (Number(value) > rule.value) {
                    fieldErrors.push(rule.message)
                  }
                  break
                }
              }
            }
          }

          if (fieldErrors.length > 0) {
            errors[field.id] = fieldErrors
          }
        }
      }
      instance.validationErrors = errors
    }

    instance.updatedAt = new Date().toISOString()
    instance.version += 1

    await writeInstance(instance)

    return NextResponse.json({ instance })
  } catch (error) {
    console.error("Error updating form instance:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
