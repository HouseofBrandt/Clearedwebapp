import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getFormSchema, getAvailableForms } from "@/lib/forms/registry"
import { FormInstance } from "@/lib/forms/types"
import { randomUUID } from "crypto"
import { promises as fs } from "fs"
import path from "path"

// File-based storage for form instances (development only)
// In production, this would use the Prisma database
const FORMS_DATA_DIR = path.join(process.cwd(), "data", "form-instances")

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(FORMS_DATA_DIR, { recursive: true })
  } catch {
    // Directory already exists
  }
}

async function readInstance(instanceId: string): Promise<FormInstance | null> {
  try {
    const filePath = path.join(FORMS_DATA_DIR, `${instanceId}.json`)
    const data = await fs.readFile(filePath, "utf-8")
    return JSON.parse(data) as FormInstance
  } catch {
    return null
  }
}

async function writeInstance(instance: FormInstance): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(FORMS_DATA_DIR, `${instance.id}.json`)
  await fs.writeFile(filePath, JSON.stringify(instance, null, 2), "utf-8")
}

async function listInstancesForCase(caseId: string): Promise<FormInstance[]> {
  await ensureDataDir()
  const files = await fs.readdir(FORMS_DATA_DIR).catch(() => [] as string[])
  const instances: FormInstance[] = []

  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const filePath = path.join(FORMS_DATA_DIR, file)
      const data = await fs.readFile(filePath, "utf-8")
      const instance = JSON.parse(data) as FormInstance
      if (instance.caseId === caseId) {
        instances.push(instance)
      }
    } catch {
      // Skip corrupt files
    }
  }

  return instances.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

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

    // If no caseId, return available form schemas
    if (!caseId) {
      const forms = getAvailableForms()
      return NextResponse.json({ forms })
    }

    // Return form instances for the case
    const instances = await listInstancesForCase(caseId)
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

    await writeInstance(instance)

    return NextResponse.json({ instance }, { status: 201 })
  } catch (error) {
    console.error("Error creating form instance:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Re-export helpers for the [instanceId] route
export { readInstance, writeInstance }
