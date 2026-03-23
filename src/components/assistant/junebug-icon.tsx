/**
 * Junebug — a minimal line-art dog face icon.
 * Two states: resting (static) and thinking (subtle ear animation).
 */
export function JunebugIcon({ className = "h-5 w-5", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${animated ? "animate-junebug-think" : ""}`}
    >
      {/* Head */}
      <ellipse cx="12" cy="13" rx="7" ry="6.5" />
      {/* Left ear (floppy) */}
      <path d="M5.5 10 C4 6, 3.5 4, 6 5" className={animated ? "origin-[5.5px_10px] animate-junebug-ear" : ""} />
      {/* Right ear (floppy) */}
      <path d="M18.5 10 C20 6, 20.5 4, 18 5" className={animated ? "origin-[18.5px_10px] animate-junebug-ear" : ""} />
      {/* Eyes */}
      <circle cx="9.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
      {/* Nose */}
      <ellipse cx="12" cy="14.5" rx="1.2" ry="0.8" fill="currentColor" stroke="none" />
      {/* Mouth */}
      <path d="M10.5 16 Q12 17.5 13.5 16" />
    </svg>
  )
}
