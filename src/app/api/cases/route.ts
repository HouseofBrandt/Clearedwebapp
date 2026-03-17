import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get("status")
  const caseType = searchParams.get("caseType")
  const search = searchParams.get("search")
  const page = parseInt(searchParams.get("page") || "1")
  const limit = parseInt(searchParams.get("limit") || "20")

  const where: any = {}
  if (status) where.status = status
  if (caseType) where.caseType = caseType
  if (search) {
    where.OR = [
      { caseNumber: { contains: search, mode: "insensitive" } },
      { clientName: { contains: search, mode: "insensitive" } },
    ]
  }

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        assignedPractitioner: { select: { id: true, name: true } },
        _count: { select: { documents: true, aiTasks: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.case.count({ where }),
  ])

  return NextResponse.json({ cases, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { clientName, caseType, notes } = body

    if (!clientName || !caseType) {
      return NextResponse.json(
        { error: "Client name and case type are required" },
        { status: 400 }
      )
    }

    // Generate case number: CLR-YYYY-MM-NNNN
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const prefix = `CLR-${year}-${month}-`

    const lastCase = await prisma.case.findFirst({
      where: { caseNumber: { startsWith: prefix } },
      orderBy: { caseNumber: "desc" },
    })

    let sequence = 1
    if (lastCase) {
      const lastSeq = parseInt(lastCase.caseNumber.split("-").pop() || "0")
      sequence = lastSeq + 1
    }

    const caseNumber = `${prefix}${String(sequence).padStart(4, "0")}`

    const newCase = await prisma.case.create({
      data: {
        caseNumber,
        clientName,
        caseType,
        notes: notes || null,
        assignedPractitionerId: (session.user as any).id,
        status: "INTAKE",
      },
      include: {
        assignedPractitioner: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(newCase, { status: 201 })
  } catch (error) {
    console.error("Create case error:", error)
    return NextResponse.json({ error: "Failed to create case" }, { status: 500 })
  }
}
