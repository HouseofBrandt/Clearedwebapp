interface JunebugIconProps {
  className?: string
  animated?: boolean
  mood?: "idle" | "happy" | "thinking" | "treat"
  style?: React.CSSProperties
}

/**
 * Junebug icon — a friendly dog face, front-facing.
 * Pointy ears, round head, bright eyes, visible snout + tongue.
 * Clearly reads as a happy dog at every size from 14px to 48px.
 * Uses currentColor for the fill, with white detail features.
 *
 * Moods:
 *  - idle: static, calm
 *  - happy: gentle ear wiggle + eye sparkle
 *  - thinking: head tilt + ear perk (for loading states)
 *  - treat: excited bounce + tail wag effect
 */
export function JunebugIcon({ className = "h-5 w-5", animated = false, mood = "idle", style }: JunebugIconProps) {
  const activeMood = animated ? (mood === "idle" ? "thinking" : mood) : mood === "treat" ? "treat" : "idle"

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`${className} ${activeMood === "treat" ? "jb-bounce" : ""}`}
      style={style}
      aria-label="Junebug"
    >
      {/* Left ear — pointy, triangular */}
      <path
        d="M5 2.5L3 8.5L8 7.5Z"
        fill="currentColor"
        className={activeMood === "thinking" ? "jb-ear-left-think" : activeMood === "happy" || activeMood === "treat" ? "jb-ear-wiggle-l" : ""}
      />
      {/* Right ear — pointy, triangular */}
      <path
        d="M19 2.5L21 8.5L16 7.5Z"
        fill="currentColor"
        className={activeMood === "thinking" ? "jb-ear-right-think" : activeMood === "happy" || activeMood === "treat" ? "jb-ear-wiggle-r" : ""}
      />

      {/* Head — round, friendly */}
      <ellipse cx="12" cy="12.5" rx="8" ry="7.5" fill="currentColor" />

      {/* Inner face — lighter muzzle area */}
      <ellipse cx="12" cy="14.5" rx="4.5" ry="4" fill="white" opacity="0.15" />

      {/* Left eye — bright, round */}
      <circle cx="9" cy="11" r="1.6" fill="white" opacity="0.95" />
      <circle cx="9.3" cy="10.7" r="0.9" fill="#1e293b" />
      {/* Eye shine */}
      <circle cx="9.7" cy="10.3" r="0.3" fill="white" className={activeMood === "happy" || activeMood === "treat" ? "jb-sparkle" : ""} />

      {/* Right eye — bright, round */}
      <circle cx="15" cy="11" r="1.6" fill="white" opacity="0.95" />
      <circle cx="15.3" cy="10.7" r="0.9" fill="#1e293b" />
      {/* Eye shine */}
      <circle cx="15.7" cy="10.3" r="0.3" fill="white" className={activeMood === "happy" || activeMood === "treat" ? "jb-sparkle" : ""} />

      {/* Nose — prominent, dark */}
      <ellipse cx="12" cy="14" rx="1.5" ry="1.1" fill="#1e293b" opacity="0.9" />
      {/* Nose shine */}
      <ellipse cx="11.6" cy="13.6" rx="0.5" ry="0.3" fill="white" opacity="0.4" />

      {/* Mouth line */}
      <path d="M12 15.1 Q10.5 16.5 9.5 15.8" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />
      <path d="M12 15.1 Q13.5 16.5 14.5 15.8" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />

      {/* Tongue — only shows when happy or treat */}
      {(activeMood === "happy" || activeMood === "treat") && (
        <ellipse cx="12" cy="16.8" rx="1" ry="1.5" fill="#f87171" opacity="0.85" className="jb-tongue" />
      )}

      {/* Eyebrows — expressive, subtle arches */}
      <path d="M7.5 9 Q9 8 10.5 9" fill="none" stroke="white" strokeWidth="0.4" opacity="0.4" />
      <path d="M13.5 9 Q15 8 16.5 9" fill="none" stroke="white" strokeWidth="0.4" opacity="0.4" />

      <style>{`
        @keyframes jb-tilt {
          0%, 85%, 100% { transform: rotate(0deg); transform-origin: 12px 12px; }
          90% { transform: rotate(6deg); transform-origin: 12px 12px; }
          95% { transform: rotate(-3deg); transform-origin: 12px 12px; }
        }
        @keyframes jb-ear-perk-l {
          0%, 80%, 100% { transform: rotate(0deg); transform-origin: 6px 7px; }
          88% { transform: rotate(-8deg); transform-origin: 6px 7px; }
        }
        @keyframes jb-ear-perk-r {
          0%, 83%, 100% { transform: rotate(0deg); transform-origin: 18px 7px; }
          91% { transform: rotate(8deg); transform-origin: 18px 7px; }
        }
        @keyframes jb-ear-wag-l {
          0%, 100% { transform: rotate(0deg); transform-origin: 6px 7px; }
          25% { transform: rotate(-5deg); transform-origin: 6px 7px; }
          75% { transform: rotate(3deg); transform-origin: 6px 7px; }
        }
        @keyframes jb-ear-wag-r {
          0%, 100% { transform: rotate(0deg); transform-origin: 18px 7px; }
          25% { transform: rotate(5deg); transform-origin: 18px 7px; }
          75% { transform: rotate(-3deg); transform-origin: 18px 7px; }
        }
        @keyframes jb-sparkle-anim {
          0%, 100% { opacity: 1; r: 0.3; }
          50% { opacity: 0.5; r: 0.5; }
        }
        @keyframes jb-tongue-anim {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(1px); }
        }
        @keyframes jb-bounce-anim {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-3px); }
          50% { transform: translateY(0); }
          70% { transform: translateY(-1.5px); }
        }
        .jb-ear-left-think { animation: jb-ear-perk-l 3s ease-in-out infinite; }
        .jb-ear-right-think { animation: jb-ear-perk-r 3s ease-in-out infinite; }
        .jb-ear-wiggle-l { animation: jb-ear-wag-l 1.2s ease-in-out infinite; }
        .jb-ear-wiggle-r { animation: jb-ear-wag-r 1.2s ease-in-out infinite; }
        .jb-sparkle { animation: jb-sparkle-anim 1.5s ease-in-out infinite; }
        .jb-tongue { animation: jb-tongue-anim 0.8s ease-in-out infinite; }
        .jb-bounce { animation: jb-bounce-anim 0.6s ease-out; }
      `}</style>
    </svg>
  )
}

/**
 * Treat bone icon for the reward button.
 */
export function TreatBoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Give treat">
      <path
        d="M5.5 3C4 3 3 4.2 3 5.5C3 6.5 3.6 7.3 4.5 7.7L7 10L5.5 11.5L3.5 13.5C2.5 14.5 2.5 16 3.5 17C4 17.5 4.7 17.7 5.5 17.5L7.7 16.3L10 14L14 10L16.3 7.7L17.5 5.5C17.7 4.7 17.5 4 17 3.5C16 2.5 14.5 2.5 13.5 3.5L11.5 5.5L10 7L7.7 4.5C7.3 3.6 6.5 3 5.5 3Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M18.5 21C20 21 21 19.8 21 18.5C21 17.5 20.4 16.7 19.5 16.3L17 14L14 17L16.3 19.5C16.7 20.4 17.5 21 18.5 21Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  )
}
