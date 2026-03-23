"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mfaCode, setMfaCode] = useState("")
  const [mfaRequired, setMfaRequired] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const idleReason = searchParams.get("reason")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        mfaCode: mfaRequired ? mfaCode : undefined,
        redirect: false,
      })

      if (result?.error) {
        if (result.error.includes("MFA_REQUIRED")) {
          setMfaRequired(true)
          setError("")
        } else if (result.error.includes("Invalid MFA code")) {
          setError("Invalid verification code. Please try again.")
          setMfaCode("")
        } else {
          setError("Invalid email or password")
        }
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function handleBackToLogin() {
    setMfaRequired(false)
    setMfaCode("")
    setPassword("")
    setError("")
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="w-full py-6 px-6 flex items-center gap-2" style={{ backgroundColor: "#1B2A4A" }}>
        <Shield className="h-7 w-7 text-white" />
        <span className="text-xl font-bold text-white">Cleared</span>
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#1B2A4A" }}>
            <Shield className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl" style={{ color: "#1B2A4A" }}>Cleared</CardTitle>
          <CardDescription>
            {mfaRequired
              ? "Enter your verification code"
              : "Sign in to the Tax Resolution Platform"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {idleReason === "idle" && !error && (
            <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              Your session expired due to inactivity. Please sign in again.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {!mfaRequired ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@firm.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="mfaCode">Verification Code</Label>
                  <Input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
                  {loading ? "Verifying..." : "Verify"}
                </Button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to login
                </button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
