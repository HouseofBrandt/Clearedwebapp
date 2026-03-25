"use client"

import { useState, useEffect, Suspense, useRef, useCallback } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

// ═══════════════════════════════════════════════════════════════
// LUXURY LOGIN — Full-screen cinematic experience
// ═══════════════════════════════════════════════════════════════

// Animated gauge that responds to scroll/time
function CockpitGauge({ mounted, delay = 0, targetAngle = 220, label = "ALT", size = 80 }: {
  mounted: boolean; delay?: number; targetAngle?: number; label?: string; size?: number
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="drop-shadow-lg">
      {/* Glass backing */}
      <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      {/* Tick marks */}
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i * 10 - 90) * Math.PI / 180
        const major = i % 3 === 0
        return (
          <line key={i}
            x1={50 + (major ? 36 : 39) * Math.cos(angle)} y1={50 + (major ? 36 : 39) * Math.sin(angle)}
            x2={50 + 43 * Math.cos(angle)} y2={50 + 43 * Math.sin(angle)}
            stroke={major ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)"} strokeWidth={major ? 1.2 : 0.4}
          />
        )
      })}
      {/* Teal arc — operating range */}
      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(46,134,171,0.15)" strokeWidth="3"
        strokeDasharray="69 208" strokeDashoffset="-69" strokeLinecap="round" />
      {/* Needle */}
      <line x1="50" y1="50" x2="50" y2="12" stroke="#2E86AB" strokeWidth="1.5" strokeLinecap="round"
        style={{
          transformOrigin: "50px 50px",
          transform: mounted ? `rotate(${targetAngle}deg)` : "rotate(0deg)",
          transition: `transform 3s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
        }}
      />
      <circle cx="50" cy="50" r="2.5" fill="#2E86AB" />
      <circle cx="50" cy="50" r="1" fill="white" opacity="0.7" />
      {/* Label */}
      <text x="50" y="70" fill="rgba(255,255,255,0.25)" fontSize="6" textAnchor="middle" fontFamily="'DM Mono', monospace">{label}</text>
    </svg>
  )
}

// Mini radar sweep
function MiniRadar({ mounted, size = 60 }: { mounted: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="drop-shadow-lg">
      <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      {[15, 30, 42].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(46,134,171,0.08)" strokeWidth="0.3" />)}
      <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(46,134,171,0.05)" strokeWidth="0.3" />
      <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(46,134,171,0.05)" strokeWidth="0.3" />
      <g style={{ transformOrigin: "50px 50px", animation: mounted ? "radar-sweep 4s linear infinite" : "none" }}>
        <defs><linearGradient id="miniSweep" gradientTransform="rotate(90)">
          <stop offset="0%" stopColor="rgba(46,134,171,0)" /><stop offset="100%" stopColor="rgba(46,134,171,0.2)" />
        </linearGradient></defs>
        <path d="M50,50 L50,8 A42,42 0 0,1 80,18 Z" fill="url(#miniSweep)" />
        <line x1="50" y1="50" x2="50" y2="8" stroke="rgba(46,134,171,0.5)" strokeWidth="0.8" />
      </g>
      {[{ x: 35, y: 30 }, { x: 65, y: 38 }, { x: 40, y: 62 }].map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r="1.5" fill="#2E86AB"
          style={{ animation: mounted ? "radar-blip 4s ease-out infinite" : "none", animationDelay: `${i * 1.3}s`, opacity: 0 }} />
      ))}
      <circle cx="50" cy="50" r="1.5" fill="#2E86AB" opacity="0.7" />
    </svg>
  )
}

// Scanning line effect
function ScanLine({ mounted }: { mounted: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: mounted ? 1 : 0, transition: "opacity 2s" }}>
      <div className="absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-teal-400/20 to-transparent"
        style={{ animation: "scanline 6s linear infinite" }} />
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
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

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ backgroundColor: "#050a14" }}>
      {/* ═══ LAYER 1: Full-screen video background ═══ */}
      <video
        ref={videoRef}
        autoPlay muted loop playsInline
        onCanPlay={handleVideoLoad}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: videoLoaded && mounted ? 0.55 : 0,
          transition: "opacity 3s ease-out",
          filter: "saturate(0.8) contrast(1.1)",
        }}
      >
        <source src="/api/video/login-bg" type="video/mp4" />
      </video>

      {/* ═══ LAYER 2: Cinematic overlays ═══ */}
      {/* Bottom-heavy vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050a14] via-[#050a14]/40 to-[#050a14]/70" />
      {/* Left edge fade for form area */}
      <div className="absolute inset-0 bg-gradient-to-l from-[#050a14]/95 via-[#050a14]/30 to-transparent" style={{ width: "45%" , marginLeft: "55%" }} />
      {/* Subtle teal tint */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 40%, rgba(46,134,171,0.06) 0%, transparent 70%)" }} />

      {/* ═══ LAYER 3: Scan line + grain ═══ */}
      <ScanLine mounted={mounted} />
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.03, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")" }} />

      {/* ═══ LAYER 4: Content ═══ */}
      <div className="relative z-10 flex min-h-screen">

        {/* LEFT — Branding, instruments, hero */}
        <div className="hidden lg:flex lg:w-[58%] flex-col justify-between p-12">
          {/* Top — Logo + cockpit instruments */}
          <div className="flex items-start justify-between">
            {/* Logo */}
            <div className="transition-all duration-1000 ease-out"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(-20px)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
                  <span className="text-xl font-bold text-white">C</span>
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-white">Cleared</div>
                  <div className="text-[8px] font-mono tracking-[0.4em] text-teal-400/50 uppercase mt-0.5">Tax Resolution Platform</div>
                </div>
              </div>
            </div>

            {/* Cockpit instruments cluster — floating top-right */}
            <div className="flex items-center gap-3 transition-all duration-1500 ease-out"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(-20px) scale(0.9)", transitionDelay: "1.5s" }}>
              <CockpitGauge mounted={mounted} delay={0.8} targetAngle={245} label="ALT" size={72} />
              <CockpitGauge mounted={mounted} delay={1.2} targetAngle={155} label="SPD" size={64} />
              <MiniRadar mounted={mounted} size={64} />
            </div>
          </div>

          {/* Center — Hero statement */}
          <div className="max-w-2xl -mt-12">
            <h1 className="transition-all duration-1000 ease-out"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(40px)", transitionDelay: "0.3s" }}>
              <span className="block text-[5rem] font-extrabold leading-[0.95] tracking-[-0.03em] text-white/95">
                Cleared
              </span>
              <span className="block text-[5rem] font-extrabold leading-[0.95] tracking-[-0.03em]">
                <span className="bg-gradient-to-r from-teal-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  for takeoff.
                </span>
              </span>
            </h1>

            <p className="mt-8 text-lg leading-relaxed text-white/40 max-w-lg transition-all duration-1000 ease-out"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(30px)", transitionDelay: "0.7s" }}>
              From notice to resolution. Your AI-powered tax command center.
            </p>

            {/* Metrics strip */}
            <div className="mt-10 flex items-end gap-12 transition-all duration-1000 ease-out"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)", transitionDelay: "1.1s" }}>
              {[
                { value: "6", label: "Resolution\nPathways", accent: false },
                { value: "12+", label: "AI Work\nProducts", accent: true },
                { value: "45", label: "SOC 2\nControls", accent: false },
              ].map((stat) => (
                <div key={stat.label} className="relative">
                  <div className={`text-4xl font-bold font-mono tracking-tight ${stat.accent ? "text-teal-400" : "text-white/80"}`}>
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[9px] text-white/25 uppercase tracking-[0.15em] leading-tight whitespace-pre-line font-mono">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom — System status + platform names */}
          <div className="flex items-center justify-between transition-all duration-1000 ease-out"
            style={{ opacity: mounted ? 1 : 0, transitionDelay: "2s" }}>
            {/* Status indicators */}
            <div className="flex items-center gap-6">
              {[
                { label: "SYS", value: "NOMINAL", ok: true },
                { label: "ENC", value: "AES-256", ok: true },
                { label: "PII", value: "SECURED", ok: true },
                { label: "AI", value: "READY", ok: true },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 text-[8px] font-mono tracking-[0.2em]">
                  <span className={`inline-block w-1 h-1 rounded-full ${s.ok ? "bg-emerald-400/60" : "bg-red-400/60"}`} />
                  <span className="text-white/15">{s.label}</span>
                  <span className="text-white/30">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Platform names */}
            <div className="flex items-center gap-4 text-[8px] font-mono tracking-[0.25em] text-white/15">
              {["JUNEBUG", "BANJO", "SWITCHBOARD"].map((name, i) => (
                <span key={name} className="flex items-center gap-4">
                  {i > 0 && <span className="h-px w-3 bg-white/8" />}
                  <span className="hover:text-teal-400/40 transition-colors">{name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Glassmorphic login card */}
        <div className="flex flex-1 items-center justify-center px-8 lg:justify-end lg:pr-16">
          <div
            className="w-full max-w-[380px] transition-all duration-1000 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateX(0) scale(1)" : "translateX(40px) scale(0.95)",
              transitionDelay: "0.5s",
            }}
          >
            {/* Glass card */}
            <div className="relative rounded-3xl border border-white/[0.08] p-10 shadow-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                backdropFilter: "blur(40px) saturate(1.5)",
                boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}>

              {/* Subtle glow accent */}
              <div className="absolute -top-px left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-teal-400/30 to-transparent" />

              {/* Mobile logo */}
              <div className="flex items-center gap-2.5 mb-8 lg:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                  <span className="text-base font-bold text-white">C</span>
                </div>
                <span className="text-lg font-semibold text-white">Cleared</span>
              </div>

              <h2 className="text-[22px] font-semibold tracking-tight text-white">
                Sign in
              </h2>
              <p className="mt-2 text-sm text-white/35">
                Enter your credentials to access the workspace.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 backdrop-blur">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-[12px] font-medium text-white/50 uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    id="email" type="email" autoComplete="email" autoFocus required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@firm.com"
                    className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white shadow-inner transition-all placeholder:text-white/20 focus:border-teal-400/40 focus:outline-none focus:ring-1 focus:ring-teal-400/20 focus:bg-white/[0.06]"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-[12px] font-medium text-white/50 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    id="password" type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white shadow-inner transition-all placeholder:text-white/20 focus:border-teal-400/40 focus:outline-none focus:ring-1 focus:ring-teal-400/20 focus:bg-white/[0.06]"
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="group relative flex w-full items-center justify-center rounded-xl px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-teal-500/20 hover:shadow-xl disabled:opacity-50 overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #1B3A5C 0%, #2E86AB 100%)" }}>
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  <span className="relative">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Authenticating...
                      </span>
                    ) : (
                      "Cleared for entry →"
                    )}
                  </span>
                </button>
              </form>

              <p className="mt-8 text-center text-[10px] text-white/20 tracking-wider">
                CLEARED PLATFORM · FROM NOTICE TO RESOLUTION
              </p>
            </div>

            {/* Floating cockpit gauge below card — decorative */}
            <div className="hidden lg:flex items-center justify-center mt-6 gap-4 transition-all duration-1000 ease-out"
              style={{ opacity: mounted ? 1 : 0, transitionDelay: "2s" }}>
              <CockpitGauge mounted={mounted} delay={2} targetAngle={180} label="HDG" size={48} />
              <div className="text-[8px] font-mono text-white/15 tracking-[0.3em]">FLIGHT CONTROL ACTIVE</div>
              <CockpitGauge mounted={mounted} delay={2.2} targetAngle={120} label="VSI" size={48} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ KEYFRAMES ═══ */}
      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes radar-blip {
          0% { opacity: 0; }
          10% { opacity: 0.9; }
          40% { opacity: 0.4; }
          100% { opacity: 0; }
        }
        @keyframes scanline {
          0% { top: -2px; }
          100% { top: 100%; }
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
