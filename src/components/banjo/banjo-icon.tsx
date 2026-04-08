interface BanjoIconProps {
  className?: string
  animated?: boolean
  /** "celebration" plays faster strings + scale bounce on completion */
  mood?: "idle" | "celebration"
  style?: React.CSSProperties
}

export function BanjoIcon({ className = "h-4 w-4", animated = false, mood = "idle", style }: BanjoIconProps) {
  const isCelebrating = mood === "celebration"
  const shouldAnimate = animated || isCelebrating
  const id = `bj-${Math.random().toString(36).slice(2, 6)}`

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${isCelebrating ? "banjo-celebrate" : ""}`}
      style={style}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="var(--c-gold, #C49A3C)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--c-gold, #C49A3C)" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id={`${id}-neck`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--c-gold, #C49A3C)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--c-gold, #C49A3C)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* Banjo body (circle) with gold gradient fill */}
      <circle cx="14" cy="14" r="7" fill={`url(#${id}-body)`} />
      {/* Inner ring */}
      <circle cx="14" cy="14" r="5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
      {/* Banjo neck with gradient */}
      <line x1="9" y1="9" x2="3" y2="3" stroke={`url(#${id}-neck)`} strokeWidth="2" />
      <line x1="9" y1="9" x2="3" y2="3" />
      {/* Tuning pegs */}
      <line x1="2" y1="5" x2="4" y2="5" />
      <line x1="5" y1="2" x2="5" y2="4" />
      {/* Strings */}
      <line x1="11" y1="11" x2="17" y2="17" className={shouldAnimate ? (isCelebrating ? "animate-banjo-string-fast-1" : "animate-banjo-string-1") : ""} />
      <line x1="12" y1="10" x2="18" y2="16" className={shouldAnimate ? (isCelebrating ? "animate-banjo-string-fast-2" : "animate-banjo-string-2") : ""} />
      <line x1="10" y1="12" x2="16" y2="18" className={shouldAnimate ? (isCelebrating ? "animate-banjo-string-fast-3" : "animate-banjo-string-3") : ""} />
      {/* Bridge */}
      <circle cx="14" cy="14" r="2" />
      <style>{`
        @keyframes banjoString1 {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(0.3px); }
        }
        @keyframes banjoString2 {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-0.3px); }
        }
        @keyframes banjoString3 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(0.3px); }
        }
        @keyframes banjoStringFast1 {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(0.5px); }
          75% { transform: translateX(-0.5px); }
        }
        @keyframes banjoStringFast2 {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-0.5px); }
          75% { transform: translateX(0.5px); }
        }
        @keyframes banjoStringFast3 {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(0.5px); }
          75% { transform: translateY(-0.5px); }
        }
        @keyframes banjoCelebrate {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.08) rotate(-3deg); }
          50% { transform: scale(1.05) rotate(2deg); }
          75% { transform: scale(1.08) rotate(-2deg); }
        }
        .animate-banjo-string-1 {
          animation: banjoString1 0.6s ease-in-out infinite;
        }
        .animate-banjo-string-2 {
          animation: banjoString2 0.5s ease-in-out infinite;
          animation-delay: 0.1s;
        }
        .animate-banjo-string-3 {
          animation: banjoString3 0.7s ease-in-out infinite;
          animation-delay: 0.2s;
        }
        .animate-banjo-string-fast-1 {
          animation: banjoStringFast1 0.3s ease-in-out 3;
        }
        .animate-banjo-string-fast-2 {
          animation: banjoStringFast2 0.25s ease-in-out 3;
          animation-delay: 0.05s;
        }
        .animate-banjo-string-fast-3 {
          animation: banjoStringFast3 0.35s ease-in-out 3;
          animation-delay: 0.1s;
        }
        .banjo-celebrate {
          animation: banjoCelebrate 0.8s ease-in-out;
        }
      `}</style>
    </svg>
  )
}
