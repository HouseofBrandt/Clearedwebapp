"use client"

/**
 * PippenIcon — a golden retriever mascot SVG with mood states.
 *
 * Moods:
 *  - idle:      sitting, tail gently wagging
 *  - fetching:  trotting with document in mouth
 *  - delivered: sitting proudly, document at feet
 *
 * Uses currentColor for stroke, radialGradient fill for body,
 * floppy ears, and CSS animations for movement.
 */

import { cn } from "@/lib/utils"

export type PippenMood = "idle" | "fetching" | "delivered"

interface PippenIconProps {
  mood?: PippenMood
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function PippenIcon({ mood = "idle", size = 48, className, style }: PippenIconProps) {
  const isFetching = mood === "fetching"
  const isDelivered = mood === "delivered"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        isFetching && "animate-[pip-trot_0.6s_ease-in-out_infinite]",
        className
      )}
      style={style}
      aria-label={`Pippen the golden retriever — ${mood}`}
    >
      <defs>
        <radialGradient id="pip-body" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#E8C96A" />
          <stop offset="70%" stopColor="#C49A3C" />
          <stop offset="100%" stopColor="#A67C2E" />
        </radialGradient>
        <radialGradient id="pip-ear" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#C49A3C" />
          <stop offset="100%" stopColor="#8B6914" />
        </radialGradient>
      </defs>

      {/* Body */}
      <ellipse
        cx="32"
        cy="38"
        rx="16"
        ry="14"
        fill="url(#pip-body)"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* Head */}
      <circle
        cx="32"
        cy="20"
        r="11"
        fill="url(#pip-body)"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* Floppy left ear */}
      <ellipse
        cx="22"
        cy="22"
        rx="5"
        ry="8"
        fill="url(#pip-ear)"
        stroke="currentColor"
        strokeWidth="1.2"
        className={cn(
          isFetching && "animate-[pip-ear-bob_0.6s_ease-in-out_infinite]"
        )}
        style={{ transformOrigin: "22px 16px" }}
      />

      {/* Floppy right ear */}
      <ellipse
        cx="42"
        cy="22"
        rx="5"
        ry="8"
        fill="url(#pip-ear)"
        stroke="currentColor"
        strokeWidth="1.2"
        className={cn(
          isFetching && "animate-[pip-ear-bob_0.6s_ease-in-out_infinite_0.1s]"
        )}
        style={{ transformOrigin: "42px 16px" }}
      />

      {/* Eyes */}
      <circle cx="28" cy="18" r="1.5" fill="currentColor" />
      <circle cx="36" cy="18" r="1.5" fill="currentColor" />

      {/* Nose */}
      <ellipse cx="32" cy="23" rx="2.5" ry="1.5" fill="#3D2B1F" />

      {/* Mouth / smile */}
      <path
        d="M29 25 Q32 28 35 25"
        stroke="#3D2B1F"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />

      {/* Front legs */}
      <line x1="26" y1="48" x2="26" y2="56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="48" x2="38" y2="56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

      {/* Paws */}
      <ellipse cx="26" cy="57" rx="2.5" ry="1.5" fill="url(#pip-body)" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="38" cy="57" rx="2.5" ry="1.5" fill="url(#pip-body)" stroke="currentColor" strokeWidth="1" />

      {/* Tail */}
      <path
        d="M48 34 Q54 28 52 20"
        stroke="url(#pip-body)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        className="animate-[pip-wag_1s_ease-in-out_infinite]"
        style={{ transformOrigin: "48px 34px" }}
      />

      {/* Document in mouth (fetching) */}
      {isFetching && (
        <g>
          <rect
            x="24"
            y="24"
            width="10"
            height="7"
            rx="1"
            fill="white"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line x1="26" y1="26.5" x2="32" y2="26.5" stroke="currentColor" strokeWidth="0.5" />
          <line x1="26" y1="28.5" x2="31" y2="28.5" stroke="currentColor" strokeWidth="0.5" />
        </g>
      )}

      {/* Document at feet (delivered) */}
      {isDelivered && (
        <g>
          <rect
            x="27"
            y="54"
            width="10"
            height="7"
            rx="1"
            fill="white"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line x1="29" y1="56.5" x2="35" y2="56.5" stroke="currentColor" strokeWidth="0.5" />
          <line x1="29" y1="58.5" x2="34" y2="58.5" stroke="currentColor" strokeWidth="0.5" />
          {/* Check mark */}
          <path d="M34 55 L35.5 56.5 L38 53.5" stroke="#16a34a" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}
