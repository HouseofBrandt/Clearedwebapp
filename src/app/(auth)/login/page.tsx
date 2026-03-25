"use client"

import { useState, useEffect, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

// ═══════════════════════════════════════════════════════════════
// COCKPIT INSTRUMENTS — SVG motion graphics
// ═══════════════════════════════════════════════════════════════

function AltitudeIndicator({ mounted }: { mounted: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      {/* Outer ring */}
      <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      {/* Tick marks */}
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i * 10 - 90) * Math.PI / 180
        const major = i % 3 === 0
        const r1 = major ? 44 : 47
        const r2 = 52
        return (
          <line
            key={i}
            x1={60 + r1 * Math.cos(angle)}
            y1={60 + r1 * Math.sin(angle)}
            x2={60 + r2 * Math.cos(angle)}
            y2={60 + r2 * Math.sin(angle)}
            stroke={major ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}
            strokeWidth={major ? 1.5 : 0.5}
          />
        )
      })}
      {/* Altitude numbers */}
      {[0, 1, 2, 3, 4, 5].map(n => {
        const angle = (n * 60 - 90) * Math.PI / 180
        return (
          <text
            key={n}
            x={60 + 38 * Math.cos(angle)}
            y={60 + 38 * Math.sin(angle)}
            fill="rgba(255,255,255,0.25)"
            fontSize="7"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'DM Mono', monospace"
          >
            {n}
          </text>
        )
      })}
      {/* Needle — sweeps on mount */}
      <line
        x1="60" y1="60"
        x2="60" y2="18"
        stroke="#2E86AB"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          transformOrigin: "60px 60px",
          transform: mounted ? "rotate(245deg)" : "rotate(0deg)",
          transition: "transform 2.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
      {/* Center dot */}
      <circle cx="60" cy="60" r="3" fill="#2E86AB" />
      <circle cx="60" cy="60" r="1.5" fill="white" opacity="0.6" />
      {/* Label */}
      <text x="60" y="80" fill="rgba(255,255,255,0.2)" fontSize="5" textAnchor="middle" fontFamily="'DM Mono', monospace">
        ALT × 1000
      </text>
    </svg>
  )
}

function HeadingIndicator({ mounted }: { mounted: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Compass rose */}
      {Array.from({ length: 72 }).map((_, i) => {
        const angle = (i * 5 - 90) * Math.PI / 180
        const major = i % 6 === 0
        const r1 = major ? 46 : 49
        return (
          <line
            key={i}
            x1={60 + r1 * Math.cos(angle)}
            y1={60 + r1 * Math.sin(angle)}
            x2={60 + 52 * Math.cos(angle)}
            y2={60 + 52 * Math.sin(angle)}
            stroke={i === 0 ? "#2E86AB" : major ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}
            strokeWidth={major ? 1.5 : 0.5}
          />
        )
      })}
      {/* Cardinal directions */}
      {[
        { label: "N", angle: -90, color: "#2E86AB" },
        { label: "E", angle: 0, color: "rgba(255,255,255,0.25)" },
        { label: "S", angle: 90, color: "rgba(255,255,255,0.25)" },
        { label: "W", angle: 180, color: "rgba(255,255,255,0.25)" },
      ].map(d => {
        const rad = d.angle * Math.PI / 180
        return (
          <text
            key={d.label}
            x={60 + 40 * Math.cos(rad)}
            y={60 + 40 * Math.sin(rad)}
            fill={d.color}
            fontSize="8"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'DM Mono', monospace"
          >
            {d.label}
          </text>
        )
      })}
      {/* Heading bug — rotates into position */}
      <g style={{
        transformOrigin: "60px 60px",
        transform: mounted ? "rotate(42deg)" : "rotate(0deg)",
        transition: "transform 3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s",
      }}>
        <polygon points="60,10 56,4 64,4" fill="#2E86AB" opacity="0.8" />
      </g>
      {/* Aircraft symbol (fixed) */}
      <path d="M60 52 L60 68 M54 58 L66 58 M56 66 L64 66" stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" />
      <text x="60" y="85" fill="rgba(255,255,255,0.15)" fontSize="5" textAnchor="middle" fontFamily="'DM Mono', monospace">
        HDG
      </text>
    </svg>
  )
}

function AirspeedIndicator({ mounted }: { mounted: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Speed arc — green operating range */}
      <path
        d={describeArc(60, 60, 50, -140, 30)}
        fill="none"
        stroke="rgba(46,134,171,0.15)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Tick marks */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (-140 + i * 10) * Math.PI / 180
        const major = i % 4 === 0
        return (
          <line
            key={i}
            x1={60 + (major ? 44 : 47) * Math.cos(angle)}
            y1={60 + (major ? 44 : 47) * Math.sin(angle)}
            x2={60 + 52 * Math.cos(angle)}
            y2={60 + 52 * Math.sin(angle)}
            stroke={major ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}
            strokeWidth={major ? 1.5 : 0.5}
          />
        )
      })}
      {/* Speed needle */}
      <line
        x1="60" y1="60"
        x2={60 + 40 * Math.cos(-140 * Math.PI / 180)}
        y2={60 + 40 * Math.sin(-140 * Math.PI / 180)}
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          transformOrigin: "60px 60px",
          transform: mounted ? "rotate(155deg)" : "rotate(0deg)",
          transition: "transform 2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s",
        }}
      />
      <circle cx="60" cy="60" r="3" fill="white" opacity="0.5" />
      {/* Digital readout */}
      <rect x="42" y="72" width="36" height="14" rx="2" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <text x="60" y="82" fill="#2E86AB" fontSize="8" textAnchor="middle" fontFamily="'DM Mono', monospace" fontWeight="bold">
        {mounted ? "CLR" : "---"}
      </text>
      <text x="60" y="100" fill="rgba(255,255,255,0.15)" fontSize="5" textAnchor="middle" fontFamily="'DM Mono', monospace">
        KIAS
      </text>
    </svg>
  )
}

// Arc path helper
function describeArc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
  const start = { x: x + r * Math.cos(startAngle * Math.PI / 180), y: y + r * Math.sin(startAngle * Math.PI / 180) }
  const end = { x: x + r * Math.cos(endAngle * Math.PI / 180), y: y + r * Math.sin(endAngle * Math.PI / 180) }
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function RadarSweep({ mounted }: { mounted: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      {/* Range rings */}
      {[30, 60, 85].map(r => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(46,134,171,0.08)" strokeWidth="0.5" />
      ))}
      {/* Cross hairs */}
      <line x1="100" y1="15" x2="100" y2="185" stroke="rgba(46,134,171,0.06)" strokeWidth="0.5" />
      <line x1="15" y1="100" x2="185" y2="100" stroke="rgba(46,134,171,0.06)" strokeWidth="0.5" />
      {/* Sweep beam */}
      <g style={{
        transformOrigin: "100px 100px",
        animation: mounted ? "radar-sweep 4s linear infinite" : "none",
        opacity: mounted ? 1 : 0,
        transition: "opacity 1s ease-out",
      }}>
        <defs>
          <linearGradient id="sweepGrad" gradientTransform="rotate(90)">
            <stop offset="0%" stopColor="rgba(46,134,171,0)" />
            <stop offset="100%" stopColor="rgba(46,134,171,0.15)" />
          </linearGradient>
        </defs>
        <path d="M100,100 L100,15 A85,85 0 0,1 160,32 Z" fill="url(#sweepGrad)" />
        <line x1="100" y1="100" x2="100" y2="15" stroke="rgba(46,134,171,0.4)" strokeWidth="1" />
      </g>
      {/* Blips — appear after sweep passes */}
      {[
        { x: 75, y: 55, delay: "1s" },
        { x: 130, y: 70, delay: "2s" },
        { x: 85, y: 120, delay: "3s" },
        { x: 140, y: 130, delay: "1.5s" },
        { x: 60, y: 90, delay: "2.5s" },
      ].map((blip, i) => (
        <circle
          key={i}
          cx={blip.x}
          cy={blip.y}
          r="2"
          fill="#2E86AB"
          style={{
            animation: mounted ? `radar-blip 4s ease-out infinite` : "none",
            animationDelay: blip.delay,
            opacity: 0,
          }}
        />
      ))}
      {/* Center */}
      <circle cx="100" cy="100" r="2" fill="#2E86AB" opacity="0.6" />
    </svg>
  )
}

function HorizonIndicator({ mounted }: { mounted: boolean }) {
  return (
    <svg viewBox="0 0 160 80" className="w-full" aria-hidden="true">
      <defs>
        <clipPath id="horizonClip">
          <rect x="5" y="2" width="150" height="76" rx="4" />
        </clipPath>
      </defs>
      <g clipPath="url(#horizonClip)">
        {/* Sky */}
        <rect x="0" y="0" width="160" height="40" fill="rgba(46,134,171,0.08)" />
        {/* Ground */}
        <rect x="0" y="40" width="160" height="40" fill="rgba(139,92,42,0.06)" />
        {/* Horizon line */}
        <line
          x1="0" y1="40" x2="160" y2="40"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.5"
          style={{
            transform: mounted ? "rotate(-3deg)" : "rotate(0deg)",
            transformOrigin: "80px 40px",
            transition: "transform 3s cubic-bezier(0.34, 1.56, 0.64, 1) 1s",
          }}
        />
        {/* Pitch lines */}
        {[-20, -10, 10, 20].map(p => (
          <line
            key={p}
            x1={60} y1={40 - p}
            x2={100} y2={40 - p}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.5"
          />
        ))}
      </g>
      {/* Aircraft wings indicator (fixed) */}
      <path d="M55 40 L72 40 M88 40 L105 40 M80 40 L80 45" stroke="#2E86AB" strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* Border */}
      <rect x="5" y="2" width="150" height="76" rx="4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
    </svg>
  )
}

function StatusStrip({ mounted }: { mounted: boolean }) {
  const items = [
    { label: "SYS", value: "NOMINAL", color: "text-emerald-400/60" },
    { label: "ENC", value: "AES-256", color: "text-teal-400/50" },
    { label: "PII", value: "SECURED", color: "text-emerald-400/60" },
    { label: "AI", value: "ONLINE", color: "text-teal-400/50" },
  ]
  return (
    <div
      className="flex items-center gap-5 text-[9px] font-mono tracking-widest"
      style={{
        opacity: mounted ? 1 : 0,
        transition: "opacity 2s ease-out 2s",
      }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-white/20">{item.label}</span>
          <span className={item.color}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LOGIN FORM
// ═══════════════════════════════════════════════════════════════

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
      {/* Left panel — takeoff video background */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-between text-white"
        style={{ backgroundColor: "#080f1e" }}
      >
        {/* Video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: mounted ? 0.45 : 0, transition: "opacity 2s ease-out" }}
        >
          <source src="/api/video/login-bg" type="video/mp4" />
        </video>

        {/* Dark gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#080f1e]/90 via-[#080f1e]/70 to-[#080f1e]/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080f1e]/90 via-transparent to-[#080f1e]/60" />

        {/* Content over video */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          {/* Top — Logo */}
          <div
            className="transition-all duration-700 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
                <span className="text-lg font-bold leading-none text-white">C</span>
              </div>
              <div>
                <span className="text-xl font-semibold tracking-tight">Cleared</span>
                <div className="text-[9px] font-mono tracking-[0.3em] text-teal-400/60 uppercase">Tax Resolution Platform</div>
              </div>
            </div>
          </div>

          {/* Center — Hero text */}
          <div className="flex-1 flex flex-col items-start justify-center max-w-lg">
            <div
              className="transition-all duration-1000 ease-out"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(30px)",
                transitionDelay: "500ms",
              }}
            >
              <h1 className="text-[3.5rem] font-bold leading-[1.05] tracking-tight">
                Cleared for
                <br />
                <span className="bg-gradient-to-r from-teal-400 to-teal-300 bg-clip-text text-transparent">takeoff.</span>
              </h1>
              <p className="mt-6 text-[15px] leading-relaxed text-white/50 max-w-sm">
                From notice to resolution. Your AI-powered command center for tax resolution — every case, every deadline, every work product.
              </p>
            </div>

            {/* Stats strip */}
            <div
              className="mt-10 flex items-center gap-8 transition-all duration-1000 ease-out"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(20px)",
                transitionDelay: "1000ms",
              }}
            >
              {[
                { label: "Resolution Pathways", value: "6" },
                { label: "AI Work Products", value: "12+" },
                { label: "Compliance Checks", value: "45" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-white/90 font-mono">{stat.value}</div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom — Platform names */}
          <div
            className="flex items-center gap-6 text-[10px] font-mono tracking-[0.2em] text-white/20"
            style={{
              opacity: mounted ? 1 : 0,
              transition: "opacity 2s ease-out 2s",
            }}
          >
            <span className="text-teal-400/40">●</span>
            <span>JUNEBUG</span>
            <span className="h-px w-4 bg-white/10" />
            <span>BANJO</span>
            <span className="h-px w-4 bg-white/10" />
            <span>SWITCHBOARD</span>
            <span className="h-px w-4 bg-white/10" />
            <span>GRAPH ENGINE</span>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col bg-white">
        {/* Mobile header */}
        <div className="flex items-center gap-2.5 px-6 py-5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: "#1B3A5C" }}>
            <span className="text-sm font-bold leading-none">C</span>
          </div>
          <div>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">Cleared</span>
            <span className="ml-2 text-[9px] font-mono tracking-widest text-teal-600/50 uppercase">Flight Control</span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(10px)",
                transitionDelay: "300ms",
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
              className="mt-8 space-y-5 transition-all duration-500 ease-out"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(10px)",
                transitionDelay: "500ms",
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
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
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
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 disabled:opacity-50"
                style={{ backgroundColor: "#1B3A5C" }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  "Cleared for entry"
                )}
              </button>
            </form>

            <p
              className="mt-10 text-center text-[11px] text-slate-300 transition-all duration-500 ease-out"
              style={{ opacity: mounted ? 1 : 0, transitionDelay: "700ms" }}
            >
              Cleared Platform &middot; From Notice to Resolution
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
