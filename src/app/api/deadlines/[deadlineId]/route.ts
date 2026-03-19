import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["UPCOMING", "DUE_SOON", "OVERDUE", "COMPLETED", "WAIVED"]).optional(),
  assignedToId: z.string().nullable().optional(),
  type: z.string().optional(),
  taxYear: z.number().nullable().optional(),
  irsNoticeDate: z.string().nullable().optional(),
  irsNoticeNumber: z.string().nullable().optional(),
  reminderDate: z.string().nullable().optional(),
}).strict()

export async function GET(
  request: NextRequest,
  { params }: { params: { deadlineId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const deadline = await prisma.deadline.findUnique({
    where: { id: params.deadlineId },
    include: {
      case: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
      assignedTo: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  if (!deadline) {
    return NextResponse.json({ error: "Deadline not found" }, { status: 404 })
  }

  return NextResponse.json(deadline)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { deadlineId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 })
  }

  const existing = await prisma.deadline.findUnique({ where: { id: params.deadlineId } })
  if (!existing) {
    return NextResponse.json({ error: "Deadline not found" }, { status: 404 })
  }

  const data: any = { ...parsed.data }

  // Convert date strings to Date objects
  if (data.dueDate) data.dueDate = new Date(data.dueDate)
  if (data.irsNoticeDate === null) data.irsNoticeDate = null
  else if (data.irsNoticeDate) data.irsNoticeDate = new Date(data.irsNoticeDate)
  if (data.reminderDate === null) data.reminderDate = null
  else if (data.reminderDate) data.reminderDate = new Date(data.reminderDate)

  // Auto-set completedDate and completedById when marking complete
  if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
    data.completedDate = new Date()
    data.completedById = auth.userId
  }
  // Clear completion data if un-completing
  if (data.status && data.status !== "COMPLETED" && existing.status === "COMPLETED") {
    data.completedDate = null
    data.completedById = null
  }

  const updated = await prisma.deadline.update({
    where: { id: params.deadlineId },
    data,
    include: {
      case: { select: { id: true, caseNumber: true, clientName: true } },
      assignedTo: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { deadlineId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const existing = await prisma.deadline.findUnique({ where: { id: params.deadlineId } })
  if (!existing) {
    return NextResponse.json({ error: "Deadline not found" }, { status: 404 })
  }

  await prisma.deadline.delete({ where: { id: params.deadlineId } })
  return NextResponse.json({ success: true })
}
