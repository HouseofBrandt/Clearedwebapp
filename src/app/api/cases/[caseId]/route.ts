import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { encryptField, decryptField, encryptCasePII, decryptCasePII } from "@/lib/encryption"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { canAccessCase } from "@/lib/auth/case-access"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"
import { z } from "zod"

const updateCaseSchema = z.object({
  clientName: z.string().min(1).optional(),
  caseType: z.enum(["OIC", "IA", "PENALTY", "INNOCENT_SPOUSE", "CNC", "TFRP", "ERC", "UNFILED", "AUDIT", "CDP", "AMENDED", "VOLUNTARY_DISCLOSURE", "OTHER"]).optional(),
  status: z.enum(["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE", "RESOLVED", "CLOSED"]).optional(),
  filingStatus: z.enum(["SINGLE", "MFJ", "MFS", "HOH", "QSS"]).optional().nullable(),
  clientEmail: z.string().email().optional().or(z.literal("")).nullable(),
  clientPhone: z.string().optional().nullable(),
  totalLiability: z.number().optional().nullable(),
  assignedPractitionerId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tabsNumber: z.string().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasAccess = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const caseData = await prisma.case.findUnique({
    where: { id: params.caseId },
    include: {
      assignedPractitioner: { select: { id: true, name: true, email: true } },
      documents: {
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { uploadedAt: "desc" },
      },
      aiTasks: {
        include: {
          reviewActions: {
            include: { practitioner: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 })
  }

  // Audit log: case viewed
  logAudit({
    userId: (session.user as any).id,
    action: AUDIT_ACTIONS.CASE_VIEWED,
    caseId: params.caseId,
    metadata: { tabsNumber: caseData.tabsNumber },
    ipAddress: getClientIP(),
  })

  // Decrypt detokenizedOutput on aiTasks before returning
  const decryptedCaseData = {
    ...decryptCasePII(caseData),
    aiTasks: caseData.aiTasks.map((task: any) => ({
      ...task,
      detokenizedOutput: task.detokenizedOutput ? decryptField(task.detokenizedOutput) : null,
    })),
  }

  return NextResponse.json(decryptedCaseData)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasAccessPatch = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccessPatch) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = updateCaseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { clientName, caseType, status, notes, assignedPractitionerId, filingStatus, clientEmail, clientPhone, totalLiability, tabsNumber } = parsed.data

    const updateData: any = {}
    if (tabsNumber !== undefined) updateData.tabsNumber = tabsNumber || null
    if (clientName !== undefined) {
      updateData.clientName = encryptField(clientName)
    }
    if (caseType !== undefined) updateData.caseType = caseType
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (assignedPractitionerId !== undefined) updateData.assignedPractitionerId = assignedPractitionerId
    if (filingStatus !== undefined) updateData.filingStatus = filingStatus || null
    if (clientEmail !== undefined) updateData.clientEmail = clientEmail ? encryptField(clientEmail) : null
    if (clientPhone !== undefined) updateData.clientPhone = clientPhone ? encryptField(clientPhone) : null
    if (totalLiability !== undefined) updateData.totalLiability = totalLiability != null ? totalLiability : null

    const updated = await prisma.case.update({
      where: { id: params.caseId },
      data: updateData,
      include: {
        assignedPractitioner: { select: { id: true, name: true } },
      },
    })

    logAudit({
      userId: (session.user as any).id,
      action: status ? AUDIT_ACTIONS.CASE_STATUS_CHANGED : AUDIT_ACTIONS.CASE_UPDATED,
      caseId: params.caseId,
      metadata: { fieldsChanged: Object.keys(updateData), ...(status ? { newStatus: status } : {}) },
      ipAddress: getClientIP(),
    })

    // Refresh case graph after update (fire-and-forget)
    computeCaseGraph(params.caseId).catch(() => {})

    return NextResponse.json(decryptCasePII(updated))
  } catch (error) {
    console.error("Update case error:", error)
    return NextResponse.json({ error: "Failed to update case" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userRole = (session.user as any).role
  if (userRole !== "ADMIN" && userRole !== "SENIOR") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const hasAccessDelete = await canAccessCase((session.user as any).id, params.caseId)
  if (!hasAccessDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    await prisma.case.delete({ where: { id: params.caseId } })

    logAudit({
      userId: (session.user as any).id,
      action: AUDIT_ACTIONS.CASE_DELETED,
      caseId: params.caseId,
      ipAddress: getClientIP(),
    })

    return NextResponse.json({ message: "Case deleted" })
  } catch (error) {
    console.error("Delete case error:", error)
    return NextResponse.json({ error: "Failed to delete case" }, { status: 500 })
  }
}
