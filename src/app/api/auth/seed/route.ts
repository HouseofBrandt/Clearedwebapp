import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

export async function GET() {
  return seed()
}

export async function POST() {
  return seed()
}

async function seed() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seed route disabled in production" },
      { status: 403 }
    )
  }

  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: "admin@cleared.com" },
    })

    if (existingAdmin) {
      return NextResponse.json({ message: "Seed user already exists" })
    }

    const passwordHash = await bcrypt.hash("admin123", 12)

    const admin = await prisma.user.create({
      data: {
        email: "admin@cleared.com",
        name: "Admin User",
        passwordHash,
        role: "ADMIN",
        licenseType: "EA",
        licenseNumber: "00000",
      },
    })

    const practitioner = await prisma.user.create({
      data: {
        email: "practitioner@cleared.com",
        name: "Jane Smith",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "PRACTITIONER",
        licenseType: "CPA",
        licenseNumber: "CPA-12345",
      },
    })

    return NextResponse.json({
      message: "Seed users created",
      users: [
        { email: admin.email, role: admin.role },
        { email: practitioner.email, role: practitioner.role },
      ],
    })
  } catch (error) {
    console.error("Seed error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "Failed to seed", details: message }, { status: 500 })
  }
}
