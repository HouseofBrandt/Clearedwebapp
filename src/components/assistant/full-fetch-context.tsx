"use client"

/**
 * React context for the Full Fetch armed state. Provided near the Junebug
 * workspace boundary so the toggle, the splash headline, the Junebug icon,
 * and any downstream request code all read from one source of truth.
 */

import { createContext, useContext, useMemo, useState } from "react"

interface FullFetchContextValue {
  armed: boolean
  setArmed: (v: boolean) => void
}

const FullFetchContext = createContext<FullFetchContextValue>({
  armed: false,
  setArmed: () => {},
})

export function FullFetchProvider({ children }: { children: React.ReactNode }) {
  const [armed, setArmed] = useState(false)
  const value = useMemo(() => ({ armed, setArmed }), [armed])
  return <FullFetchContext.Provider value={value}>{children}</FullFetchContext.Provider>
}

export function useFullFetch() {
  return useContext(FullFetchContext)
}
