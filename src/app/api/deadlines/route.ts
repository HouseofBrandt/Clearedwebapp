import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { DEADLINE_DEFAULT_PRIORITY } from "@/types"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { canAccessCase, caseAccessFilter } from "@/lib/auth/case-access"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"

const VALID_TYPES = [
  "CDP_HEARING", "EQUIVALENT_HEARING", "TAX_COURT_PETITION", "CSED_EXPIRATION",
  "ASSESSMENT_STATUTE", "OIC_SUBMISSION", "OIC_PAYMENT", "OIC_COMPLIANCE",
  "IA_PAYMENT", "RETURN_DUE", "EXTENSION_DUE", "ESTIMATED_TAX", "IRS_RESPONSE",
  "DOCUMENT_REQUEST", "POA_RENEWAL", "FOLLOW_UP", "HEARING_DATE", "MEETING",
  "INTERNAL_REVIEW", "CUSTOM",
] as const

const VALID_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const
const VALID_STATUSES = ["UPCOMING", "DUE_SOON", "OVERDUE", "COMPLETED", "WAIVED"] as const

const createSchema = z.object({
  caseId: z.string().min(1),
  type: z.enum(VALID_TYPES),
  title: z.string().min(1),
  dueDate: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  reminderDate: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
  taxYear: z.number().optional(),
  irsNoticeDate: z.string().optional(),
  irsNoticeNumber: z.string().optional(),
  source: z.string().optional(),
  sourceTaskId: z.string().optional(),
})

/** Compute display status based on dueDate and stored status */
function computeStatus(deadline: { dueDate: Date; status: string; completedDate: Date | null }) {
  if (deadline.status === "COMPLETED" || deadline.status === "WAIVED") return deadline.status
  const now = new Date()
  const due = new Date(deadline.dueDate)
  if (due < now) return "OVERDUE"
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  if (due.getTime() - now.getTime() < sevenDaysMs) return "DUE_SOON"
  return "UPCOMING"
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const url = request.nextUrl.searchParams
  const caseId = url.get("caseId")
  const status = url.get("status")
  const assignedToId = url.get("assignedToId")
  const priority = url.get("priority")
  const from = url.get("from")
  const to = url.get("to")

  const accessFilter = await caseAccessFilter(auth.userId)
  const where: any = { case: accessFilter }
  if (caseId) where.caseId = caseId
  if (assignedToId) where.assignedToId = assignedToId
  if (priority) where.priority = priority as any

  // By default, exclude completed/waived unless explicitly requested
  if (status === "COMPLETED") {
    where.status = "COMPLETED"
  } else if (status === "WAIVED") {
    where.status = "WAIVED"
  } else if (status) {
    // Status filtering is computed, so we fetch all non-completed and filter after
    where.status = { notIn: ["COMPLETED", "WAIVED"] }
  } else {
    where.status = { notIn: ["COMPLETED", "WAIVED"] }
  }

  if (from || to) {
    where.dueDate = {}
    if (from) where.dueDate.gte = new Date(from)
    if (to) where.dueDate.lte = new Date(to)
  }

  const deadlines = await prisma.deadline.findMany({
    where,
    include: {
      case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
      assignedTo: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  })

  // Compute display status
  const withComputedStatus = deadlines.map((d) => ({
    ...d,
    computedStatus: computeStatus(d),
  }))

  // Filter by computed status if requested
  const filtered = status && !["COMPLETED", "WAIVED"].includes(status)
    ? withComputedStatus.filter((d) => d.computedStatus === status)
    : withComputedStatus

  return NextResponse.json(filtered)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 })
  }

  const data = parsed.data

  const hasAccess = await canAccessCase(auth.userId, data.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Auto-set priority from type if not provided
  const priority = data.priority || DEADLINE_DEFAULT_PRIORITY[data.type] || "MEDIUM"

  const deadline = await prisma.deadline.create({
    data: {
      caseId: data.caseId,
      type: data.type as any,
      title: data.title,
      dueDate: new Date(data.dueDate),
      description: data.description,
      priority: priority as any,
      reminderDate: data.reminderDate ? new Date(data.reminderDate) : null,
      assignedToId: data.assignedToId || null,
      taxYear: data.taxYear,
      irsNoticeDate: data.irsNoticeDate ? new Date(data.irsNoticeDate) : null,
      irsNoticeNumber: data.irsNoticeNumber,
      source: data.source || "manual",
      sourceTaskId: data.sourceTaskId,
      createdById: auth.userId,
    },
    include: {
      case: { select: { id: true, tabsNumber: true, clientName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  })

  // Audit log (fire-and-forget)
  logAudit({
    userId: auth.userId,
    action: AUDIT_ACTIONS.DEADLINE_CREATED,
    caseId: data.caseId,
    resourceId: deadline.id,
    resourceType: "Deadline",
    metadata: { type: data.type, title: data.title, dueDate: data.dueDate },
  })

  // Refresh case graph (fire-and-forget)
  computeCaseGraph(data.caseId).catch(() => {})

  // Log activity (fire-and-forget)
  prisma.caseActivity.create({
    data: {
      caseId: data.caseId,
      userId: auth.userId,
      action: "DEADLINE_CREATED",
      description: `Created deadline: ${data.title}`,
      metadata: { deadlineId: deadline.id, type: data.type, dueDate: data.dueDate },
    },
  }).catch(() => {})

  return NextResponse.json(deadline, { status: 201 })
}
