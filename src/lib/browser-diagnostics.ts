"use client"

// ─── Browser Error Collector ─────────────────────────────────────
// Collects console errors, unhandled exceptions, and network failures
// so Junebug can see what's happening on the page and diagnose issues.

export interface BrowserError {
  type: "console_error" | "network_error" | "unhandled_exception"
  message: string
  source?: string
  timestamp: number
  details?: string
}

export interface NetworkFailure {
  url: string
  status: number
  method: string
  timestamp: number
}

export interface PageContext {
  route: string
  title: string
  errors: BrowserError[]
  networkFailures: NetworkFailure[]
}

class BrowserDiagnostics {
  private errors: BrowserError[] = []
  private networkFailures: NetworkFailure[] = []
  private maxItems = 50
  private initialized = false

  init() {
    if (this.initialized || typeof window === "undefined") return
    this.initialized = true

    // Capture console.error
    const origError = console.error
    console.error = (...args: any[]) => {
      this.addError({
        type: "console_error",
        message: args
          .map((a) => (typeof a === "object" ? JSON.stringify(a).slice(0, 200) : String(a)))
          .join(" "),
        timestamp: Date.now(),
      })
      origError.apply(console, args)
    }

    // Capture unhandled errors
    window.addEventListener("error", (e) => {
      this.addError({
        type: "unhandled_exception",
        message: e.message,
        source: `${e.filename}:${e.lineno}:${e.colno}`,
        timestamp: Date.now(),
      })
    })

    // Capture unhandled promise rejections
    window.addEventListener("unhandledrejection", (e) => {
      this.addError({
        type: "unhandled_exception",
        message: String(e.reason?.message || e.reason || "Promise rejected"),
        timestamp: Date.now(),
      })
    })

    // Intercept fetch to capture network failures
    const origFetch = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : String(args[0])
      const method = (args[1]?.method || "GET").toUpperCase()
      try {
        const response = await origFetch.apply(window, args)
        if (!response.ok && response.status >= 400) {
          this.addNetworkFailure({
            url: url.slice(0, 200),
            status: response.status,
            method,
            timestamp: Date.now(),
          })
        }
        return response
      } catch (err: any) {
        this.addNetworkFailure({
          url: url.slice(0, 200),
          status: 0,
          method,
          timestamp: Date.now(),
        })
        throw err
      }
    }
  }

  private addError(error: BrowserError) {
    this.errors.push(error)
    if (this.errors.length > this.maxItems) this.errors.shift()
  }

  private addNetworkFailure(failure: NetworkFailure) {
    this.networkFailures.push(failure)
    if (this.networkFailures.length > this.maxItems) this.networkFailures.shift()
  }

  getContext(): PageContext {
    return {
      route: typeof window !== "undefined" ? window.location.pathname : "",
      title: typeof document !== "undefined" ? document.title : "",
      errors: this.errors.slice(-10),
      networkFailures: this.networkFailures.slice(-10),
    }
  }

  getRecentErrors(): BrowserError[] {
    return this.errors.slice(-5)
  }

  hasRecentErrors(): boolean {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    return this.errors.some((e) => e.timestamp > fiveMinAgo)
  }

  clear() {
    this.errors = []
    this.networkFailures = []
  }
}

// Singleton
export const browserDiagnostics = new BrowserDiagnostics()
