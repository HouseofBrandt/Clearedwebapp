interface JunebugIconProps {
  className?: string
  animated?: boolean
}

/**
 * Junebug icon — a minimal, single-stroke dog face.
 * Named after the boss's dog.
 *
 * Two states:
 * - Resting: static, calm
 * - Thinking (animated=true): subtle ear twitch + tail wag
 */
export function JunebugIcon({ className = "h-5 w-5", animated = false }: JunebugIconProps) {
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
      {/* Head outline */}
      <ellipse cx="12" cy="13" rx="7" ry="6.5" />
      {/* Left ear — floppy */}
      <path
        d="M6.5 9 C5 5, 3 6, 4 9.5"
        className={animated ? "animate-junebug-ear-left" : ""}
      />
      {/* Right ear — floppy */}
      <path
        d="M17.5 9 C19 5, 21 6, 20 9.5"
        className={animated ? "animate-junebug-ear-right" : ""}
      />
      {/* Eyes — alert dots */}
      <circle cx="9.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
      {/* Nose */}
      <ellipse cx="12" cy="15" rx="1.2" ry="0.8" fill="currentColor" stroke="none" />
      {/* Mouth — small happy curve */}
      <path d="M10.5 16.2 Q12 17.2 13.5 16.2" />
      {/* Tongue — only when animated (thinking = panting) */}
      {animated && (
        <path
          d="M12 16.8 Q12.3 18.5 11.5 18.5"
          className="animate-junebug-tongue"
          strokeWidth="1.2"
        />
      )}
      <style>{`
        @keyframes junebug-ear-twitch-left {
          0%, 85%, 100% { transform: rotate(0deg); transform-origin: 6.5px 9px; }
          90% { transform: rotate(-6deg); transform-origin: 6.5px 9px; }
        }
        @keyframes junebug-ear-twitch-right {
          0%, 80%, 100% { transform: rotate(0deg); transform-origin: 17.5px 9px; }
          88% { transform: rotate(6deg); transform-origin: 17.5px 9px; }
        }
        @keyframes junebug-tongue-wag {
          0%, 100% { transform: rotate(0deg); transform-origin: 12px 16.8px; }
          30% { transform: rotate(8deg); transform-origin: 12px 16.8px; }
          60% { transform: rotate(-5deg); transform-origin: 12px 16.8px; }
        }
        .animate-junebug-ear-left {
          animation: junebug-ear-twitch-left 3s ease-in-out infinite;
        }
        .animate-junebug-ear-right {
          animation: junebug-ear-twitch-right 3s ease-in-out infinite;
        }
        .animate-junebug-tongue {
          animation: junebug-tongue-wag 1.5s ease-in-out infinite;
        }
      `}</style>
    </svg>
  )
}
