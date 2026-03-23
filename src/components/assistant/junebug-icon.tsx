interface JunebugIconProps {
  className?: string
  animated?: boolean
}

/**
 * Junebug icon — a minimal dog head silhouette in profile.
 * Pointed snout, one floppy ear, clean outline.
 * Works at every size from 14px (inline text) to 40px (empty state).
 * Uses currentColor so it inherits text color.
 *
 * Animated state: subtle head tilt + ear perk.
 */
export function JunebugIcon({ className = "h-5 w-5", animated = false }: JunebugIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-label="Junebug"
    >
      {/* Dog head silhouette — 3/4 view, single fill shape */}
      <path
        d="M12.5 4C14.5 4 16 5.2 16.5 7L17 7C19 7 20.5 8.8 20.5 11C20.5 13.2 19 15 17 15L16.2 15L15 17.5C14.3 18.8 13 19.5 11.5 19.5L10 19.5C8.5 19.5 7.2 18.8 6.5 17.5L5.5 15.5C4 15 3 13.3 3 11.5C3 9.2 4.8 7.5 7 7.5L7 7C7 5.5 8.5 4 10.5 4L12.5 4Z"
        className={animated ? "animate-junebug-tilt" : ""}
      />
      {/* Ear — floppy, sits on top-right of head */}
      <path
        d="M15.5 4C16.8 2.5 19 2.8 19 4.5C19 5.8 17.8 7 16.5 7"
        fill="currentColor"
        className={animated ? "animate-junebug-ear" : ""}
      />
      {/* Eye — bright dot */}
      <circle cx="10.5" cy="11" r="1.1" fill="white" opacity="0.9" />
      {/* Nose — rounded triangle */}
      <ellipse cx="7" cy="13" rx="1.2" ry="0.9" fill="white" opacity="0.7" />

      <style>{`
        @keyframes junebug-tilt {
          0%, 88%, 100% { transform: rotate(0deg); transform-origin: 12px 12px; }
          92% { transform: rotate(4deg); transform-origin: 12px 12px; }
          96% { transform: rotate(-2deg); transform-origin: 12px 12px; }
        }
        @keyframes junebug-ear-perk {
          0%, 85%, 100% { transform: rotate(0deg); transform-origin: 16.5px 7px; }
          90% { transform: rotate(-12deg); transform-origin: 16.5px 7px; }
        }
        .animate-junebug-tilt {
          animation: junebug-tilt 4s ease-in-out infinite;
        }
        .animate-junebug-ear {
          animation: junebug-ear-perk 4s ease-in-out infinite;
        }
      `}</style>
    </svg>
  )
}
