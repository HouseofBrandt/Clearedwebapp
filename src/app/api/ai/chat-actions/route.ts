import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const actionSchema = z.object({
  action: z.enum([
    "GENERATE_DOCUMENT_REQUEST",
    "UPDATE_CASE_STATUS",
    "CREATE_DEADLINE",
    "UPDATE_IRS_STATUS",
    "ADD_CASE_NOTE",
  ]),
  caseId: z.string().min(1),
  payload: z.record(z.string(), z.any()),
})

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { action, caseId, payload } = parsed.data

  // Verify case exists
  const caseExists = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } })
  if (!caseExists) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 })
  }

  try {
    switch (action) {
      case "GENERATE_DOCUMENT_REQUEST": {
        const { clientName, missingDocs, message } = payload as any

        let letterContent = `DOCUMENT REQUEST\n\n`
        letterContent += `To: ${clientName || "Client"}\n`
        letterContent += `From: ${auth.name}\n`
        letterContent += `Date: ${new Date().toLocaleDateString("en-US")}\n`
        letterContent += `Re: Documents Needed for Tax Resolution\n\n`
        letterContent += `Dear ${(clientName || "Client").split(" ")[0]},\n\n`
        letterContent += `In order to proceed with your tax resolution case, we need the following documents at your earliest convenience:\n\n`

        const docs = Array.isArray(missingDocs) ? missingDocs : []
        let num = 1
        for (const doc of docs.filter((d: any) => d.critical)) {
          letterContent += `${num}. ${doc.label} — REQUIRED\n`
          num++
        }
        const optional = docs.filter((d: any) => !d.critical)
        if (optional.length > 0) {
          letterContent += `\nThe following would also be helpful if available:\n\n`
          for (const doc of optional) {
            letterContent += `${num}. ${doc.label}\n`
            num++
          }
        }

        letterContent += `\nPlease send these documents to our secure portal or bring them to your next appointment.\n\n`
        letterContent += `If you have questions about any item on this list, please don't hesitate to call.\n\n`
        letterContent += `Sincerely,\n${auth.name}\n`

        const task = await prisma.aITask.create({
          data: {
            caseId,
            taskType: "CASE_MEMO",
            status: "APPROVED",
            detokenizedOutput: letterContent,
            modelUsed: "practitioner-generated",
            createdById: auth.userId,
          },
        })

        await prisma.reviewAction.create({
          data: {
            aiTaskId: task.id,
            practitionerId: auth.userId,
            action: "APPROVE",
            reviewNotes: "Auto-approved: Document request generated via Junebug",
            reviewStartedAt: new Date(),
            reviewCompletedAt: new Date(),
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId,
            userId: auth.userId,
            action: "DOCUMENT_REQUESTED",
            description: `${auth.name} generated a document request list with ${docs.length} items via Junebug`,
            metadata: { taskId: task.id, missingDocs: docs },
          },
        })

        await prisma.caseIntelligence.upsert({
          where: { caseId },
          create: {
            caseId,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: "Generated document request list",
          },
          update: {
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: "Generated document request list",
          },
        })

        return NextResponse.json({
          success: true,
          taskId: task.id,
          message: `Document request created with ${docs.length} items — added to Deliverables`,
        })
      }

      case "UPDATE_CASE_STATUS": {
        const { phase, notes } = payload as any

        await prisma.caseIntelligence.upsert({
          where: { caseId },
          create: {
            caseId,
            resolutionPhase: phase,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: `Status updated to ${phase}`,
          },
          update: {
            resolutionPhase: phase,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: `Status updated to ${phase}`,
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId,
            userId: auth.userId,
            action: "STATUS_CHANGED",
            description: `${auth.name} updated case phase to "${phase}"${notes ? `: ${notes}` : ""}`,
            metadata: { newPhase: phase, notes },
          },
        })

        return NextResponse.json({ success: true })
      }

      case "CREATE_DEADLINE": {
        const deadline = await prisma.deadline.create({
          data: {
            caseId,
            type: (payload.type || "CUSTOM") as any,
            title: payload.title,
            dueDate: new Date(payload.dueDate),
            priority: (payload.priority || "MEDIUM") as any,
            description: payload.description,
            status: "UPCOMING",
            assignedToId: auth.userId,
            createdById: auth.userId,
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId,
            userId: auth.userId,
            action: "DEADLINE_CREATED",
            description: `${auth.name} created deadline: ${payload.title} (due ${payload.dueDate})`,
            metadata: { deadlineId: deadline.id },
          },
        })

        return NextResponse.json({ success: true, deadlineId: deadline.id })
      }

      case "UPDATE_IRS_STATUS": {
        const irsUpdates: any = {}
        if (payload.irsLastAction) irsUpdates.irsLastAction = payload.irsLastAction
        if (payload.irsLastActionDate) irsUpdates.irsLastActionDate = new Date(payload.irsLastActionDate)
        if (payload.irsAssignedUnit) irsUpdates.irsAssignedUnit = payload.irsAssignedUnit
        if (payload.irsAssignedEmployee) irsUpdates.irsAssignedEmployee = payload.irsAssignedEmployee

        await prisma.caseIntelligence.upsert({
          where: { caseId },
          create: { caseId, ...irsUpdates },
          update: irsUpdates,
        })

        await prisma.caseActivity.create({
          data: {
            caseId,
            userId: auth.userId,
            action: "STATUS_CHANGED",
            description: `${auth.name} updated IRS status: ${payload.irsLastAction || payload.notes || "updated"}`,
            metadata: payload,
          },
        })

        return NextResponse.json({ success: true })
      }

      case "ADD_CASE_NOTE": {
        await prisma.caseActivity.create({
          data: {
            caseId,
            userId: auth.userId,
            action: "NOTE_ADDED",
            description: `${auth.name}: ${payload.note}`,
            metadata: { note: payload.note },
          },
        })

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[ChatActions] Error:", error.message)
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
