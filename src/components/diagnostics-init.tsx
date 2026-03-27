"use client"

import { useEffect } from "react"
import { browserDiagnostics } from "@/lib/browser-diagnostics"

/**
 * Initializes the browser diagnostics singleton on mount.
 * Renders nothing — drop into any layout to start collecting
 * console errors, unhandled exceptions, and network failures.
 */
export function DiagnosticsInit() {
  useEffect(() => {
    browserDiagnostics.init()
  }, [])
  return null
}
