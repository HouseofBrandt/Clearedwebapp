"use client"

import { useState, useEffect, Suspense, useCallback } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    setMounted(true)
    const reason = searchParams.get("reason")
    if (reason === "idle") setError("Session expired. Please sign in again.")
  }, [searchParams])

  const handleVideoLoad = useCallback(() => setVideoLoaded(true), [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (result?.error) {
        setError(result.error === "MFA_REQUIRED" ? "MFA verification required." : "Invalid email or password.")
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

  const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ backgroundColor: "#0A1628" }}>
      <video autoPlay muted loop playsInline onCanPlay={handleVideoLoad} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: videoLoaded && mounted ? 1 : 0, transition: `opacity 0.4s ${ease}`, filter: "saturate(0.9) brightness(1.15)" }}>
        <source src="/api/video/login-bg" type="video/mp4" />
      </video>

      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(10,22,40,0.6) 0%, rgba(20,36,64,0.45) 40%, rgba(10,22,40,0.55) 100%), radial-gradient(ellipse at 20% 80%, rgba(42,143,168,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(196,154,60,0.08) 0%, transparent 50%)` }} />

      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.02, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h60v60H0z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")`, backgroundSize: "60px 60px" }} />

      <div className="hidden lg:flex flex-col justify-end absolute bottom-0 left-0 z-10 p-16 pb-20" style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: `opacity 1200ms ${ease} 600ms, transform 1200ms ${ease} 600ms` }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "56px", fontWeight: 400, color: "white", lineHeight: 1.05, letterSpacing: "-0.03em" }}>Cleared for<br />takeoff.</h1>
        <div className="mt-5 h-px w-16" style={{ background: "linear-gradient(90deg, rgba(42,143,168,0.6), transparent)" }} />
        <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "rgba(255,255,255,0.35)", marginTop: "16px", letterSpacing: "0.02em" }}>AI-powered tax resolution. From notice to resolution.</p>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center lg:justify-end lg:pr-[10%] px-6">
        <div className="w-full max-w-[400px]" style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateX(0) scale(1)" : "translateX(16px) scale(0.98)", transition: `opacity 800ms ${ease} 400ms, transform 800ms ${ease} 400ms` }}>
          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(32px) saturate(1.3)", WebkitBackdropFilter: "blur(32px) saturate(1.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "44px", boxShadow: "0 32px 64px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: "linear-gradient(135deg, #2A8FA8 0%, #1E6E82 100%)", boxShadow: "0 2px 8px rgba(42,143,168,0.3), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              </div>
              <div><div style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 400, color: "white", lineHeight: 1, letterSpacing: "-0.02em" }}>Cleared</div></div>
            </div>

            <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "rgba(255,255,255,0.3)", marginTop: "20px", lineHeight: 1.5 }}>Sign in to your tax resolution workspace.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.15)", color: "rgba(255,140,130,0.9)" }}>{error}</div>}

              <div>
                <label htmlFor="email" style={{ display: "block", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 600, color: focusedField === "email" ? "rgba(42,143,168,0.8)" : "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", transition: "color 200ms ease" }}>Email</label>
                <input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                  style={{ display: "block", width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid", borderColor: focusedField === "email" ? "rgba(42,143,168,0.4)" : "rgba(255,255,255,0.08)", borderRadius: "10px", padding: "10px 14px", fontFamily: "var(--font-body)", fontSize: "14px", color: "white", outline: "none", transition: "border-color 200ms ease, box-shadow 200ms ease", boxShadow: focusedField === "email" ? "0 0 0 3px rgba(42,143,168,0.08)" : "none" }} />
              </div>

              <div>
                <label htmlFor="password" style={{ display: "block", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 600, color: focusedField === "password" ? "rgba(42,143,168,0.8)" : "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", transition: "color 200ms ease" }}>Password</label>
                <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
                  style={{ display: "block", width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid", borderColor: focusedField === "password" ? "rgba(42,143,168,0.4)" : "rgba(255,255,255,0.08)", borderRadius: "10px", padding: "10px 14px", fontFamily: "var(--font-body)", fontSize: "14px", color: "white", outline: "none", transition: "border-color 200ms ease, box-shadow 200ms ease", boxShadow: focusedField === "password" ? "0 0 0 3px rgba(42,143,168,0.08)" : "none" }} />
              </div>

              <button type="submit" disabled={loading}
                style={{ width: "100%", padding: "12px", background: loading ? "rgba(42,143,168,0.5)" : "linear-gradient(180deg, #2A8FA8 0%, #1E7A92 100%)", color: "white", border: "none", borderRadius: "12px", fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", transition: "all 200ms ease", boxShadow: loading ? "none" : "0 2px 8px rgba(42,143,168,0.25), inset 0 1px 0 rgba(255,255,255,0.12)", letterSpacing: "0.01em", marginTop: "8px" }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.boxShadow = "0 4px 16px rgba(42,143,168,0.35), inset 0 1px 0 rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(-1px)" } }}
                onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.boxShadow = "0 2px 8px rgba(42,143,168,0.25), inset 0 1px 0 rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(0)" } }}>
                {loading ? <span className="flex items-center justify-center gap-2"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Signing in...</span> : "Sign in"}
              </button>
            </form>

            <div className="mt-8 flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
              <p style={{ fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 500, color: "rgba(255,255,255,0.15)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Cleared &copy; 2026</p>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
