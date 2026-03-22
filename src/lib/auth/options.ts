import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required")
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) {
          logAudit({ userId: "unknown", action: AUDIT_ACTIONS.LOGIN_FAILURE, metadata: { email: credentials.email, reason: "user_not_found" } })
          throw new Error("Invalid email or password")
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )

        if (!isValid) {
          logAudit({ userId: user.id, action: AUDIT_ACTIONS.LOGIN_FAILURE, metadata: { email: credentials.email, reason: "invalid_password" } })
          throw new Error("Invalid email or password")
        }

        logAudit({ userId: user.id, action: AUDIT_ACTIONS.LOGIN_SUCCESS, metadata: { email: user.email } })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          licenseType: user.licenseType,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.role = (user as any).role
        token.licenseType = (user as any).licenseType
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId as string
        (session.user as any).role = token.role as string
        (session.user as any).licenseType = token.licenseType as string | null
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
}
