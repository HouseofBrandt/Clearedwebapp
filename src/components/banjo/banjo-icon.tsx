interface BanjoIconProps {
  className?: string
  animated?: boolean
}

export function BanjoIcon({ className = "h-4 w-4", animated = false }: BanjoIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Banjo body (circle) */}
      <circle cx="14" cy="14" r="7" />
      {/* Banjo neck */}
      <line x1="9" y1="9" x2="3" y2="3" />
      {/* Tuning pegs */}
      <line x1="2" y1="5" x2="4" y2="5" />
      <line x1="5" y1="2" x2="5" y2="4" />
      {/* Strings */}
      <line x1="11" y1="11" x2="17" y2="17" className={animated ? "animate-banjo-string-1" : ""} />
      <line x1="12" y1="10" x2="18" y2="16" className={animated ? "animate-banjo-string-2" : ""} />
      <line x1="10" y1="12" x2="16" y2="18" className={animated ? "animate-banjo-string-3" : ""} />
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
      `}</style>
    </svg>
  )
}
