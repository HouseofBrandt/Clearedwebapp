"use client"

import { useState, useEffect, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    setMounted(true)
    const reason = searchParams.get("reason")
    if (reason === "idle") {
      setError("Session expired due to inactivity. Please sign in again.")
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        if (result.error === "MFA_REQUIRED") {
          // Future: show MFA input
          setError("MFA verification required.")
        } else {
          setError("Invalid email or password.")
        }
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-slate-950 p-12 text-white">
        <div
          className="transition-all duration-700 ease-out"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(12px)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <span className="text-lg font-bold leading-none">C</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">Cleared</span>
          </div>
        </div>

        <div
          className="max-w-md transition-all duration-700 ease-out delay-200"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <h1 className="text-[2.75rem] font-semibold leading-[1.1] tracking-tight">
            Tax resolution,
            <br />
            <span className="text-white/50">cleared.</span>
          </h1>
          <p className="mt-6 text-[15px] leading-relaxed text-white/40">
            The operating system for tax resolution practices.
            Cases, research, work product, and institutional
            memory — coordinated by AI, controlled by practitioners.
          </p>
        </div>

        <div
          className="flex items-center gap-6 text-[11px] uppercase tracking-[0.2em] text-white/25 transition-all duration-700 ease-out delay-500"
          style={{
            opacity: mounted ? 1 : 0,
          }}
        >
          <span>Junebug Intelligence</span>
          <span className="h-px w-4 bg-white/15" />
          <span>Banjo Work Product</span>
          <span className="h-px w-4 bg-white/15" />
          <span>Knowledge Graph</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col bg-white">
        {/* Mobile header */}
        <div className="flex items-center gap-2.5 px-6 py-5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <span className="text-sm font-bold leading-none">C</span>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Cleared</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div
              className="transition-all duration-500 ease-out delay-300"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(10px)",
              }}
            >
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Sign in
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Enter your credentials to access the workspace.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5 transition-all duration-500 ease-out delay-500"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(10px)",
              }}
            >
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-[13px] font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-[13px] font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p
              className="mt-10 text-center text-[11px] text-slate-300 transition-all duration-500 ease-out delay-700"
              style={{ opacity: mounted ? 1 : 0 }}
            >
              Cleared Platform &middot; Secure access for authorized practitioners
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
