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

  const ease = "cubic-bezier(0.4, 0, 0.2, 1)"

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ backgroundColor: "#0F1D2F" }}>
      {/* Video background */}
      <video
        autoPlay muted loop playsInline
        onCanPlay={handleVideoLoad}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: videoLoaded && mounted ? 1 : 0,
          transition: `opacity 2s ${ease}`,
        }}
      >
        <source src="/api/video/login-bg" type="video/mp4" />
      </video>

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(135deg, rgba(15,29,47,0.88), rgba(27,58,92,0.82))",
      }} />

      {/* Left branding — desktop only */}
      <div
        className="hidden lg:block absolute bottom-16 left-16 z-10"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 1000ms ${ease} 500ms, transform 1000ms ${ease} 500ms`,
        }}
      >
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "48px", fontWeight: 400, color: "white", lineHeight: 1.1 }}>
          Cleared for takeoff.
        </h1>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "rgba(255,255,255,0.4)", marginTop: "12px" }}>
          Your AI-powered tax command center.
        </p>
      </div>

      {/* Login card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center lg:justify-end lg:pr-[10%] px-6">
        <div
          className="w-full max-w-[400px]"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateX(0)" : "translateX(20px)",
            transition: `opacity 800ms ${ease} 300ms, transform 800ms ${ease} 300ms`,
          }}
        >
          <div style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "40px",
          }}>
            {/* Logo */}
            <div style={{ fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 400, color: "white" }}>
              Cleared
            </div>
            <div style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.1em",
              marginTop: "4px",
            }}>
              From notice to resolution
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              {error && (
                <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" style={{
                  display: "block",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "8px",
                }}>
                  Email
                </label>
                <input
                  id="email" type="email" autoComplete="email" autoFocus required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="login-input"
                  style={{
                    display: "block",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 0,
                    padding: "8px 0",
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label htmlFor="password" style={{
                  display: "block",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "8px",
                }}>
                  Password
                </label>
                <input
                  id="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  style={{
                    display: "block",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 0,
                    padding: "8px 0",
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#2E86AB",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  transition: "opacity 200ms",
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
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

            <p style={{
              textAlign: "center",
              fontFamily: "var(--font-sans)",
              fontSize: "11px",
              color: "rgba(255,255,255,0.2)",
              marginTop: "32px",
            }}>
              Cleared &copy; 2026
            </p>
          </div>
        </div>
      </div>

      {/* Focus style for inputs */}
      <style>{`
        .login-input:focus {
          border-bottom-color: #2E86AB !important;
        }
      `}</style>
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
