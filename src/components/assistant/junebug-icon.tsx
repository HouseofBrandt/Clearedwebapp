interface JunebugIconProps {
  className?: string
  animated?: boolean
  mood?: "idle" | "happy" | "thinking" | "treat"
  style?: React.CSSProperties
  fullFetch?: boolean
}

export function JunebugIcon({ className = "h-5 w-5", animated = false, mood = "idle", style, fullFetch = false }: JunebugIconProps) {
  const activeMood = animated ? (mood === "idle" ? "thinking" : mood) : mood === "treat" ? "treat" : "idle"
  const id = `jb-${Math.random().toString(36).slice(2, 6)}`

  return (
    <div className="relative inline-flex" style={{ display: 'inline-flex', lineHeight: 0 }}>
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} ${activeMood === "treat" ? "jb-bounce" : ""}`} style={style} aria-label="Junebug">
      <defs>
        <radialGradient id={`${id}-head`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.85" />
        </radialGradient>
        {fullFetch && (
          <radialGradient id={`${id}-eyeglow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--c-teal-bright, #34B8D8)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--c-teal, #2A8FA8)" stopOpacity="0.6" />
          </radialGradient>
        )}
        {fullFetch && (
          <linearGradient id={`${id}-shield`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-teal, #2A8FA8)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--c-teal, #2A8FA8)" stopOpacity="0.05" />
          </linearGradient>
        )}
      </defs>
      <path d="M5 2.5L3 8.5L8 7.5Z" fill="currentColor" className={activeMood === "thinking" ? "jb-ear-left-think" : activeMood === "happy" || activeMood === "treat" ? "jb-ear-wiggle-l" : ""} />
      <path d="M19 2.5L21 8.5L16 7.5Z" fill="currentColor" className={activeMood === "thinking" ? "jb-ear-right-think" : activeMood === "happy" || activeMood === "treat" ? "jb-ear-wiggle-r" : ""} />
      <ellipse cx="12" cy="12.5" rx="8" ry="7.5" fill={`url(#${id}-head)`} />
      <ellipse cx="12" cy="14.5" rx="4.5" ry="4" fill="white" opacity="0.15" />
      <circle cx="9" cy="11" r="1.6" fill="white" opacity="0.95" />
      <circle cx="9.3" cy="10.7" r="0.9" fill={fullFetch ? "none" : "#1e293b"} />
      <circle cx="9.7" cy="10.3" r="0.3" fill="white" className={activeMood === "happy" || activeMood === "treat" ? "jb-sparkle" : ""} />
      <circle cx="15" cy="11" r="1.6" fill="white" opacity="0.95" />
      <circle cx="15.3" cy="10.7" r="0.9" fill={fullFetch ? "none" : "#1e293b"} />
      <circle cx="15.7" cy="10.3" r="0.3" fill="white" className={activeMood === "happy" || activeMood === "treat" ? "jb-sparkle" : ""} />
      <ellipse cx="12" cy="14" rx="1.5" ry="1.1" fill="#1e293b" opacity="0.9" />
      <ellipse cx="11.6" cy="13.6" rx="0.5" ry="0.3" fill="white" opacity="0.4" />
      <path d="M12 15.1 Q10.5 16.5 9.5 15.8" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />
      <path d="M12 15.1 Q13.5 16.5 14.5 15.8" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />
      {(activeMood === "happy" || activeMood === "treat") && (
        <ellipse cx="12" cy="16.8" rx="1" ry="1.5" fill="#f87171" opacity="0.85" className="jb-tongue" />
      )}
      <path d="M7.5 9 Q9 8 10.5 9" fill="none" stroke="white" strokeWidth="0.4" opacity="0.4" />
      <path d="M13.5 9 Q15 8 16.5 9" fill="none" stroke="white" strokeWidth="0.4" opacity="0.4" />
      {fullFetch && (
        <>
          <path d="M5.5 5L12 2.5L18.5 5L17.5 8.5L6.5 8.5Z" fill="none" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.7" opacity="0.9" strokeLinejoin="round" />
          <path d="M7 7.5L12 6L17 7.5" fill="none" stroke="var(--c-teal-bright, #34B8D8)" strokeWidth="0.3" opacity="0.5" />
          <path d="M8 13.5L12 11.5L16 13.5L16 18.5L12 20L8 18.5Z" fill={`url(#${id}-shield)`} stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.5" opacity="0.8" strokeLinejoin="round" />
          <circle cx="12" cy="15.5" r="1.2" fill="none" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.4" opacity="0.5" />
          <circle cx="9.3" cy="10.7" r="1.0" fill={`url(#${id}-eyeglow)`}><animate attributeName="opacity" values="0.85;1;0.85" dur="2s" repeatCount="indefinite" /></circle>
          <circle cx="15.3" cy="10.7" r="1.0" fill={`url(#${id}-eyeglow)`}><animate attributeName="opacity" values="0.85;1;0.85" dur="2s" repeatCount="indefinite" /></circle>
          <circle cx="9.3" cy="10.7" r="2" fill="var(--c-teal, #2A8FA8)" opacity="0.08"><animate attributeName="r" values="1.8;2.2;1.8" dur="2s" repeatCount="indefinite" /></circle>
          <circle cx="15.3" cy="10.7" r="2" fill="var(--c-teal, #2A8FA8)" opacity="0.08"><animate attributeName="r" values="1.8;2.2;1.8" dur="2s" repeatCount="indefinite" /></circle>
          <line x1="1.5" y1="11.5" x2="3.5" y2="12" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.5" opacity="0.35"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" /></line>
          <line x1="22.5" y1="11.5" x2="20.5" y2="12" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.5" opacity="0.35"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" begin="0.5s" /></line>
          <line x1="1.5" y1="14" x2="3" y2="14" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.3" opacity="0.2" />
          <line x1="22.5" y1="14" x2="21" y2="14" stroke="var(--c-teal, #2A8FA8)" strokeWidth="0.3" opacity="0.2" />
        </>
      )}
      <style>{`
        @keyframes jb-ear-perk-l { 0%, 80%, 100% { transform: rotate(0deg); transform-origin: 6px 7px; } 88% { transform: rotate(-8deg); transform-origin: 6px 7px; } }
        @keyframes jb-ear-perk-r { 0%, 83%, 100% { transform: rotate(0deg); transform-origin: 18px 7px; } 91% { transform: rotate(8deg); transform-origin: 18px 7px; } }
        @keyframes jb-ear-wag-l { 0%, 100% { transform: rotate(0deg); transform-origin: 6px 7px; } 25% { transform: rotate(-5deg); transform-origin: 6px 7px; } 75% { transform: rotate(3deg); transform-origin: 6px 7px; } }
        @keyframes jb-ear-wag-r { 0%, 100% { transform: rotate(0deg); transform-origin: 18px 7px; } 25% { transform: rotate(5deg); transform-origin: 18px 7px; } 75% { transform: rotate(-3deg); transform-origin: 18px 7px; } }
        @keyframes jb-sparkle-anim { 0%, 100% { opacity: 1; r: 0.3; } 50% { opacity: 0.5; r: 0.5; } }
        @keyframes jb-tongue-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(1px); } }
        @keyframes jb-bounce-anim { 0%, 100% { transform: translateY(0); } 30% { transform: translateY(-3px); } 50% { transform: translateY(0); } 70% { transform: translateY(-1.5px); } }
        .jb-ear-left-think { animation: jb-ear-perk-l 3s ease-in-out infinite; }
        .jb-ear-right-think { animation: jb-ear-perk-r 3s ease-in-out infinite; }
        .jb-ear-wiggle-l { animation: jb-ear-wag-l 1.2s ease-in-out infinite; }
        .jb-ear-wiggle-r { animation: jb-ear-wag-r 1.2s ease-in-out infinite; }
        .jb-sparkle { animation: jb-sparkle-anim 1.5s ease-in-out infinite; }
        .jb-tongue { animation: jb-tongue-anim 0.8s ease-in-out infinite; }
        .jb-bounce { animation: jb-bounce-anim 0.6s ease-out; }
      `}</style>
    </svg>
    {fullFetch && (
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--c-teal, #2A8FA8)', boxShadow: '0 0 6px var(--c-teal, #2A8FA8), 0 0 12px rgba(42,143,168,0.2)' }} />
    )}
    </div>
  )
}

export function TreatBoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Give treat">
      <path d="M5.5 3C4 3 3 4.2 3 5.5C3 6.5 3.6 7.3 4.5 7.7L7 10L5.5 11.5L3.5 13.5C2.5 14.5 2.5 16 3.5 17C4 17.5 4.7 17.7 5.5 17.5L7.7 16.3L10 14L14 10L16.3 7.7L17.5 5.5C17.7 4.7 17.5 4 17 3.5C16 2.5 14.5 2.5 13.5 3.5L11.5 5.5L10 7L7.7 4.5C7.3 3.6 6.5 3 5.5 3Z" fill="currentColor" opacity="0.9" />
      <path d="M18.5 21C20 21 21 19.8 21 18.5C21 17.5 20.4 16.7 19.5 16.3L17 14L14 17L16.3 19.5C16.7 20.4 17.5 21 18.5 21Z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}
