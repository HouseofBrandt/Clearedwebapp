export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFormSchema, getAvailableForms } from "@/lib/forms/registry"
import { FormInstance } from "@/lib/forms/types"
import { saveFormInstance, listFormInstances } from "@/lib/forms/form-store"
import { randomUUID } from "crypto"

/**
 * GET /api/forms?caseId=xxx
 * List form instances for a case, or list available form schemas
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const caseId = searchParams.get("caseId")

    // If no caseId, return available form schemas and recent instances
    if (!caseId) {
      const forms = getAvailableForms()
      const instances = await listFormInstances()
      return NextResponse.json({ forms, instances: instances.slice(0, 10) })
    }

    // Return form instances for the case
    const instances = await listFormInstances(caseId)
    return NextResponse.json({ instances })
  } catch (error) {
    console.error("Error listing form instances:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/forms
 * Create a new form instance
 * Body: { caseId: string, formNumber: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { caseId, formNumber } = body

    if (!caseId || !formNumber) {
      return NextResponse.json(
        { error: "caseId and formNumber are required" },
        { status: 400 }
      )
    }

    // Validate the form schema exists
    const schema = getFormSchema(formNumber)
    if (!schema) {
      return NextResponse.json(
        { error: `Form schema not found: ${formNumber}` },
        { status: 404 }
      )
    }

    // Build default values from the schema
    const defaultValues: Record<string, any> = {}
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.defaultValue !== undefined) {
          defaultValues[field.id] = field.defaultValue
        }
      }
    }

    const now = new Date().toISOString()
    const instance: FormInstance = {
      id: randomUUID(),
      formNumber,
      caseId,
      status: "draft",
      values: defaultValues,
      completedSections: [],
      validationErrors: {},
      createdAt: now,
      updatedAt: now,
      createdById: (session.user as any).id,
      version: 1,
    }

    await saveFormInstance(instance)

    return NextResponse.json({ instance }, { status: 201 })
  } catch (error) {
    console.error("Error creating form instance:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
