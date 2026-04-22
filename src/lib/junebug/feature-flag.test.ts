import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  junebugThreadsEnabled,
  junebugThreadsEnabledForEmail,
} from "./feature-flag"

/**
 * Unit coverage for the two-tier rollout gate. Rollout safety hinges on
 * these being correct — a false-positive on `junebugThreadsEnabled()`
 * would expose the workspace to everyone prematurely, and a
 * false-negative on `junebugThreadsEnabledForEmail()` would lock out
 * internal beta users.
 *
 * The helpers read `process.env` at call time, so each test sets exactly
 * the vars it needs and restores the prior values in `afterEach`.
 */

const GLOBAL_VAR = "NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED"
const BETA_VAR = "NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS"

describe("junebugThreadsEnabled", () => {
  let priorGlobal: string | undefined

  beforeEach(() => {
    priorGlobal = process.env[GLOBAL_VAR]
    delete process.env[GLOBAL_VAR]
  })

  afterEach(() => {
    if (priorGlobal === undefined) delete process.env[GLOBAL_VAR]
    else process.env[GLOBAL_VAR] = priorGlobal
  })

  it("is false when the var is unset", () => {
    expect(junebugThreadsEnabled()).toBe(false)
  })

  it("is false for empty string, 'false', '0', 'TRUE' — only exact 'true' wins", () => {
    process.env[GLOBAL_VAR] = ""
    expect(junebugThreadsEnabled()).toBe(false)
    process.env[GLOBAL_VAR] = "false"
    expect(junebugThreadsEnabled()).toBe(false)
    process.env[GLOBAL_VAR] = "0"
    expect(junebugThreadsEnabled()).toBe(false)
    process.env[GLOBAL_VAR] = "TRUE"
    expect(junebugThreadsEnabled()).toBe(false)
  })

  it("is true only when the value is exactly 'true'", () => {
    process.env[GLOBAL_VAR] = "true"
    expect(junebugThreadsEnabled()).toBe(true)
  })
})

describe("junebugThreadsEnabledForEmail", () => {
  let priorGlobal: string | undefined
  let priorBeta: string | undefined

  beforeEach(() => {
    priorGlobal = process.env[GLOBAL_VAR]
    priorBeta = process.env[BETA_VAR]
    delete process.env[GLOBAL_VAR]
    delete process.env[BETA_VAR]
  })

  afterEach(() => {
    if (priorGlobal === undefined) delete process.env[GLOBAL_VAR]
    else process.env[GLOBAL_VAR] = priorGlobal
    if (priorBeta === undefined) delete process.env[BETA_VAR]
    else process.env[BETA_VAR] = priorBeta
  })

  it("short-circuits to true when global flag is on, regardless of email", () => {
    process.env[GLOBAL_VAR] = "true"
    expect(junebugThreadsEnabledForEmail("anyone@example.com")).toBe(true)
    expect(junebugThreadsEnabledForEmail(null)).toBe(true)
    expect(junebugThreadsEnabledForEmail(undefined)).toBe(true)
  })

  it("is false when global flag is off and no beta domains configured", () => {
    expect(junebugThreadsEnabledForEmail("staff@cleared.com")).toBe(false)
  })

  it("is false when beta domains configured but email is null/undefined", () => {
    process.env[BETA_VAR] = "cleared.com"
    expect(junebugThreadsEnabledForEmail(null)).toBe(false)
    expect(junebugThreadsEnabledForEmail(undefined)).toBe(false)
  })

  it("matches a single configured beta domain (case-insensitive)", () => {
    process.env[BETA_VAR] = "cleared.com"
    expect(junebugThreadsEnabledForEmail("staff@cleared.com")).toBe(true)
    expect(junebugThreadsEnabledForEmail("Staff@Cleared.COM")).toBe(true)
  })

  it("matches one of multiple comma-separated domains", () => {
    process.env[BETA_VAR] = "cleared.com, staff-internal.io ,beta.tld"
    expect(junebugThreadsEnabledForEmail("a@cleared.com")).toBe(true)
    expect(junebugThreadsEnabledForEmail("b@staff-internal.io")).toBe(true)
    expect(junebugThreadsEnabledForEmail("c@beta.tld")).toBe(true)
  })

  it("rejects non-matching domains", () => {
    process.env[BETA_VAR] = "cleared.com"
    expect(junebugThreadsEnabledForEmail("user@gmail.com")).toBe(false)
    expect(junebugThreadsEnabledForEmail("user@not-cleared.com")).toBe(false)
  })

  it("rejects malformed emails (no @) rather than matching on the whole string", () => {
    process.env[BETA_VAR] = "cleared.com"
    expect(junebugThreadsEnabledForEmail("cleared.com")).toBe(false)
    expect(junebugThreadsEnabledForEmail("")).toBe(false)
  })

  it("does not match on a substring — 'cleared.com' is not a suffix match", () => {
    // Prevent attackers from registering notcleared.com or cleared.com.attacker.tld
    process.env[BETA_VAR] = "cleared.com"
    expect(junebugThreadsEnabledForEmail("user@notcleared.com")).toBe(false)
    expect(junebugThreadsEnabledForEmail("user@cleared.com.attacker.tld")).toBe(false)
  })

  it("treats an all-whitespace beta var as empty", () => {
    process.env[BETA_VAR] = "  ,  ,  "
    expect(junebugThreadsEnabledForEmail("staff@cleared.com")).toBe(false)
  })

  it("trims whitespace around configured domains", () => {
    process.env[BETA_VAR] = "  cleared.com  "
    expect(junebugThreadsEnabledForEmail("staff@cleared.com")).toBe(true)
  })
})
