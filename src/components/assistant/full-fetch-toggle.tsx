"use client"

/**
 * FullFetchToggle — the armed/not-armed pill that lives on the Junebug
 * composer (spec §8.4 + §9). Clicking fires the 2000ms activation sequence;
 * clicking again while armed fires the 600ms deactivation.
 *
 * State is owned by a React context (`FullFetchProvider`) so the armed
 * indicator propagates to the splash headline, the Junebug icon halo, and
 * any downstream request code that needs to know the tool flag.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  FullFetchActivation,
  FullFetchDeactivation,
  FullFetchShockwave,
  FullFetchScreenFlash,
} from "./full-fetch-sequence"
import { useFullFetch } from "./full-fetch-context"

export interface FullFetchToggleProps {
  /** CSS selector for the element the HUD should wrap. Defaults to
   *  the nearest `.polish-junebug-target` ancestor, set by the parent. */
  targetSelector?: string
  disabled?: boolean
}

export function FullFetchToggle({ targetSelector, disabled }: FullFetchToggleProps) {
  const { armed, setArmed } = useFullFetch()
  const [activating, setActivating] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [shockwaveKey, setShockwaveKey] = useState(0)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  const toggle = () => {
    if (activating || deactivating || disabled) return
    if (!armed) {
      // Activate — fire shockwave immediately, sequence handles the rest.
      setShockwaveKey((k) => k + 1)
      setActivating(true)
    } else {
      // Deactivate — fast reverse.
      setDeactivating(true)
      setArmed(false)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={disabled || activating || deactivating}
        className={`polish-ff-toggle ${armed ? "ff-armed" : ""} polish-btn-tactile relative`}
        aria-pressed={armed}
        aria-label={armed ? "Disarm Full Fetch" : "Arm Full Fetch"}
      >
        {armed ? (
          <span className="ff-armed-label">Full Fetch // Armed</span>
        ) : (
          <span>Full Fetch</span>
        )}
        {/* Shockwave rings — rendered over the button for Stage 1 */}
        {activating && (
          <span key={shockwaveKey} className="absolute inset-0 pointer-events-none">
            <FullFetchShockwave />
          </span>
        )}
      </button>

      {mounted && activating &&
        createPortal(
          <>
            <FullFetchScreenFlash />
            <FullFetchActivation
              targetSelector={targetSelector}
              onComplete={() => {
                setActivating(false)
                setArmed(true)
              }}
            />
          </>,
          document.body,
        )}

      {mounted && deactivating &&
        createPortal(
          <FullFetchDeactivation onComplete={() => setDeactivating(false)} />,
          document.body,
        )}
    </>
  )
}
