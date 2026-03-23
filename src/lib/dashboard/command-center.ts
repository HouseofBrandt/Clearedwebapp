import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { decryptCasePII } from "@/lib/encryption"

export interface ActionItem {
  caseId: string
  caseIdentifier: string
  clientName: string
  priority: "critical" | "high" | "normal"
  action: string
  reason: string
  type: string
  riskScore: number
}

export interface RiskRankedCase {
  id: string
  tabsNumber: string
  clientName: string
  caseType: string
  status: string
  riskScore: number
  digest: string | null
  topNextStep: string | null
  isStale: boolean
  confidenceScore: number
  assignedPractitioner: string | null
}

export interface CommandCenterData {
  actionQueue: ActionItem[]
  riskRankedCases: RiskRankedCase[]
  deadlines: any[]
  pendingReviews: number
  briefing: string
  stats: {
    totalActive: number
    resolvedThisMonth: number
    staleCount: number
    avgRiskScore: number
  }
  recentActivity: any[]
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export async function getCommandCenterData(userId: string): Promise<CommandCenterData> {
  const accessFilter = await caseAccessFilter(userId)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [cases, deadlines, pendingReviews, resolvedThisMonth, recentActivity] = await Promise.all([
    prisma.case.findMany({
      where: { ...accessFilter, status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
      include: {
        intelligence: true,
        assignedPractitioner: { select: { name: true } },
        deadlines: {
          where: { status: "UPCOMING", dueDate: { lte: addDays(now, 7) } },
          orderBy: { dueDate: "asc" },
          take: 3,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deadline.findMany({
      where: {
        status: "UPCOMING",
        dueDate: { lte: addDays(now, 7) },
        case: accessFilter,
      },
      include: { case: { select: { id: true, tabsNumber: true, clientName: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.aITask.count({
      where: { status: "READY_FOR_REVIEW", case: accessFilter },
    }),
    prisma.case.count({
      where: { ...accessFilter, status: "RESOLVED", updatedAt: { gte: monthStart } },
    }),
    prisma.caseActivity.findMany({
      where: { case: accessFilter },
      take: 15,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } }, case: { select: { tabsNumber: true } } },
    }),
  ])

  // Decrypt PII for display
  const decryptedCases = cases.map(decryptCasePII)

  // Build action queue from case intelligence
  const actionQueue = buildActionQueue(decryptedCases)

  // Risk-rank cases
  const riskRankedCases: RiskRankedCase[] = decryptedCases
    .filter((c: any) => c.intelligence)
    .map((c: any) => {
      const nextSteps = (c.intelligence.nextSteps as any[]) || []
      return {
        id: c.id,
        tabsNumber: c.tabsNumber,
        clientName: c.clientName,
        caseType: c.caseType,
        status: c.status,
        riskScore: c.intelligence.riskScore || 0,
        digest: c.intelligence.digest || null,
        topNextStep: nextSteps[0]?.action || null,
        isStale: c.intelligence.isStale || false,
        confidenceScore: c.intelligence.confidenceScore || 0,
        assignedPractitioner: c.assignedPractitioner?.name || null,
      }
    })
    .sort((a: RiskRankedCase, b: RiskRankedCase) => b.riskScore - a.riskScore)

  // Compute stats
  const staleCount = decryptedCases.filter((c: any) => c.intelligence?.isStale).length
  const riskScores = decryptedCases
    .filter((c: any) => c.intelligence?.riskScore != null)
    .map((c: any) => c.intelligence.riskScore)
  const avgRiskScore = riskScores.length > 0
    ? Math.round(riskScores.reduce((a: number, b: number) => a + b, 0) / riskScores.length)
    : 0

  // Decrypt deadline case names
  const decryptedDeadlines = deadlines.map((d: any) => ({
    ...d,
    case: d.case ? decryptCasePII(d.case) : d.case,
  }))

  // Generate natural language briefing
  const briefing = generateBriefing(actionQueue, decryptedDeadlines, pendingReviews)

  return {
    actionQueue,
    riskRankedCases,
    deadlines: decryptedDeadlines,
    pendingReviews,
    briefing,
    stats: {
      totalActive: decryptedCases.length,
      resolvedThisMonth,
      staleCount,
      avgRiskScore,
    },
    recentActivity,
  }
}

function buildActionQueue(cases: any[]): ActionItem[] {
  const items: ActionItem[] = []

  for (const c of cases) {
    if (!c.intelligence?.nextSteps) continue
    const steps = (c.intelligence.nextSteps as any[]) || []

    for (const step of steps.slice(0, 2)) {
      items.push({
        caseId: c.id,
        caseIdentifier: c.tabsNumber,
        clientName: c.clientName,
        priority: step.priority,
        action: step.action,
        reason: step.reason,
        type: step.type,
        riskScore: c.intelligence.riskScore || 0,
      })
    }
  }

  const pOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 }
  return items.sort((a, b) => {
    if ((pOrder[a.priority] ?? 2) !== (pOrder[b.priority] ?? 2)) {
      return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2)
    }
    return b.riskScore - a.riskScore
  }).slice(0, 15)
}

function generateBriefing(actionQueue: ActionItem[], deadlines: any[], pendingReviews: number): string {
  const lines: string[] = []
  const urgentCount = actionQueue.filter(a => a.priority === "critical" || a.priority === "high").length

  if (urgentCount > 0) {
    lines.push(`You have ${urgentCount} item${urgentCount !== 1 ? "s" : ""} that need attention today.`)
  } else if (actionQueue.length > 0) {
    lines.push("No urgent items today. Here's what's next.")
  } else {
    lines.push("All clear. No action items right now.")
  }

  // Top 3 most important items as sentences
  for (const item of actionQueue.slice(0, 3)) {
    const clientPart = item.clientName ? `The ${item.clientName} ${item.caseIdentifier}` : item.caseIdentifier
    if (item.type === "deadline") {
      lines.push(`${clientPart}: ${item.action}.`)
    } else if (item.type === "review") {
      lines.push(`${clientPart} has ${item.action.toLowerCase()}.`)
    } else if (item.type === "documents") {
      lines.push(`${clientPart}: ${item.action.toLowerCase()}. ${item.reason}`)
    } else {
      lines.push(`${clientPart}: ${item.action}.`)
    }
  }

  return lines.join("\n")
}
