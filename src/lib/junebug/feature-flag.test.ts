import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  junebugThreadsEnabled,
  junebugVisibleForUser,
  getBetaEmailDomains,
} from "./feature-flag"

/**
 * These tests manipulate process.env directly; each case must restore
 * the pre-test state so parallel tests and later files aren't polluted.
 */

describe("junebugThreadsEnabled", () => {
  const orig = process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
    else process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = orig
  })

  it("returns true only when env var is exactly 'true'", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    expect(junebugThreadsEnabled()).toBe(true)
  })

  it("returns false when env var is 'false'", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "false"
    expect(junebugThreadsEnabled()).toBe(false)
  })

  it("returns false when env var is unset", () => {
    delete process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
    expect(junebugThreadsEnabled()).toBe(false)
  })

  it("returns false for truthy-but-not-exactly-true values (defense against typos)", () => {
    // 'TRUE' and '1' are NOT accepted — env var flags must be exact.
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "TRUE"
    expect(junebugThreadsEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "1"
    expect(junebugThreadsEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "yes"
    expect(junebugThreadsEnabled()).toBe(false)
  })
})

describe("getBetaEmailDomains", () => {
  const orig = process.env.JUNEBUG_BETA_EMAIL_DOMAINS
  afterEach(() => {
    if (orig === undefined) delete process.env.JUNEBUG_BETA_EMAIL_DOMAINS
    else process.env.JUNEBUG_BETA_EMAIL_DOMAINS = orig
  })

  it("returns empty array when unset", () => {
    delete process.env.JUNEBUG_BETA_EMAIL_DOMAINS
    expect(getBetaEmailDomains()).toEqual([])
  })

  it("returns empty array when empty string", () => {
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = ""
    expect(getBetaEmailDomains()).toEqual([])
  })

  it("parses a single domain", () => {
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(getBetaEmailDomains()).toEqual(["firm.com"])
  })

  it("parses comma-separated list, trimming whitespace", () => {
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com, beta.firm.com ,  example.org"
    expect(getBetaEmailDomains()).toEqual(["firm.com", "beta.firm.com", "example.org"])
  })

  it("lowercases all entries for case-insensitive comparison later", () => {
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "Firm.COM,Example.org"
    expect(getBetaEmailDomains()).toEqual(["firm.com", "example.org"])
  })

  it("filters out empty segments from trailing/double commas", () => {
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com,,example.org,"
    expect(getBetaEmailDomains()).toEqual(["firm.com", "example.org"])
  })
})

describe("junebugVisibleForUser", () => {
  const origFlag = process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
  const origDomains = process.env.JUNEBUG_BETA_EMAIL_DOMAINS

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
    delete process.env.JUNEBUG_BETA_EMAIL_DOMAINS
  })

  afterEach(() => {
    if (origFlag === undefined) delete process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
    else process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = origFlag
    if (origDomains === undefined) delete process.env.JUNEBUG_BETA_EMAIL_DOMAINS
    else process.env.JUNEBUG_BETA_EMAIL_DOMAINS = origDomains
  })

  it("returns false when the global flag is off — kill switch wins even if beta list matches", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "false"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser("alice@firm.com")).toBe(false)
  })

  it("returns true for everyone when flag is on and beta list is empty", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    expect(junebugVisibleForUser("alice@firm.com")).toBe(true)
    expect(junebugVisibleForUser("stranger@other.org")).toBe(true)
  })

  it("accepts users whose email matches the beta domain list", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com,beta.firm.com"
    expect(junebugVisibleForUser("alice@firm.com")).toBe(true)
    expect(junebugVisibleForUser("bob@beta.firm.com")).toBe(true)
  })

  it("rejects users whose email is on a domain NOT in the beta list", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser("stranger@other.org")).toBe(false)
  })

  it("is case-insensitive on the email domain", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser("alice@FIRM.COM")).toBe(true)
    expect(junebugVisibleForUser("alice@Firm.Com")).toBe(true)
  })

  it("rejects missing email when beta list is set (safer to hide than leak)", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser(null)).toBe(false)
    expect(junebugVisibleForUser(undefined)).toBe(false)
    expect(junebugVisibleForUser("")).toBe(false)
  })

  it("allows missing email when beta list is empty (open to everyone)", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    expect(junebugVisibleForUser(null)).toBe(true)
    expect(junebugVisibleForUser("")).toBe(true)
  })

  it("rejects malformed emails (no @) when beta list is set", () => {
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser("notanemail")).toBe(false)
    expect(junebugVisibleForUser("@firm.com")).toBe(false) // no local part → empty domain split behavior
  })

  it("ignores subdomain mismatches — a plain match on 'firm.com' does NOT admit 'sub.firm.com'", () => {
    // This is the strict interpretation. If ops want to admit subdomains,
    // they must list both "firm.com" and "sub.firm.com" explicitly. The
    // alternative — endsWith matching — is too permissive and could admit
    // a hostile "attackerfirm.com" that ends in "firm.com".
    process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED = "true"
    process.env.JUNEBUG_BETA_EMAIL_DOMAINS = "firm.com"
    expect(junebugVisibleForUser("alice@beta.firm.com")).toBe(false)
  })
})
