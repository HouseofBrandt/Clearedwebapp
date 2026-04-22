# Cleared — Operations Runbook

> Everything an on-call engineer needs to operate Cleared in production.
> Keep this file terse. If you need to explain the product, link to
> `docs/master-spec.md` and keep going.

---

## Deployment

- **Platform:** Vercel. Production deploys on merge to `main`.
- **Build:** `prisma generate && setup-vector --pre-push && prisma migrate deploy && next build`. Migrations run against the production Neon DB at build time.
- **Region:** `iad1` (Washington, DC). Single-region.
- **Runtime:** Node 20 serverless functions. One function per route file.
- **Cold start concerns:** Anthropic SDK is `serverComponentsExternalPackages` → loaded lazily from node_modules at request time.

### Rollback

The Vercel dashboard's "Promote to production" on an older deployment is a one-click rollback. Every deploy is retained; don't force-push to `main`.

### Bundle-size ceiling

Vercel's 300MB per-function limit has killed a deploy before. The preview-pdf route lives closest to the ceiling. See commits `e86203f` and `9fb5794` for context. The current mitigation is `src/lib/forms/registry.ts` using per-slug `await import()` so each route only bundles the schemas it actually loads. **Do not revive eager imports in `registry.ts`.** If the deploy ever fails with `exceeds the maximum size limit of 300mb`, the next step is splitting `preview-pdf` into per-form routes.

---

## Environment variables

All set in Vercel → Project Settings → Environment Variables.

| Variable | Where | Who needs it |
|---|---|---|
| `DATABASE_URL` | Neon | Every route |
| `NEXTAUTH_SECRET` | 32-byte random | Session signing |
| `NEXTAUTH_URL` | Prod URL | Session cookies |
| `ENCRYPTION_KEY` | 32-char random | `src/lib/encryption.ts` for case PII at rest |
| `ANTHROPIC_API_KEY` | Anthropic console | All AI routes |
| `CRON_SECRET` | 32-byte random | Bearer auth for `/api/cron/**` |
| `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED` | `true` / `false` | Junebug workspace global kill switch |
| `NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS` | comma-separated domain list (optional) | Junebug per-user beta gate during staged rollout |

### Verifying env state

`GET /api/health` (public, no auth) reports which required env vars are missing without exposing their values. Returns 503 if any are unset; uptime monitors pin to this.

---

## Feature flags

Two live today, both governing the Junebug Threads rollout:

- **`NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED`** — global kill switch.
  - `false` (default) — the new Junebug Threads workspace is invisible; legacy chat-panel FAB renders.
  - `true` — `/junebug` nav entry appears; sidebar / thread view / SSE streaming all become active **for everyone**.
  - Flip in Vercel env vars. Requires redeploy (not a runtime flag).
  - Use for the full rollout step and for emergency rollback (flip back to `false`).

- **`NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS`** — internal-beta gate.
  - Comma-separated list, e.g. `cleared.com,staff-internal.io`. Case-insensitive. Empty / unset = no beta users.
  - Users whose session email's domain matches see the Junebug workspace **even when the global flag is off**. Everyone else sees the legacy FAB and 404s from the workspace routes.
  - Use for step B of the staged rollout (internal dogfooding) before flipping the global flag.
  - Both vars are `NEXT_PUBLIC_` so client-side gates (nav filter, `CaseJunebug` widget) can read them without a prop-drill of the user email. The domain list is not sensitive — practitioner emails are already in the NextAuth session cookie — so the tradeoff is correct.

### Rollout sequence (spec §8)

1. **Step A — Staging.** Set `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=true` on the **Preview** environment only. Run the §11 acceptance audit against staging.
2. **Step B — Internal beta.** In **Production**: keep the global flag `false`; set `NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS` to the firm's email domain(s). Dogfood ≥ 1 week. Monitor `tag:junebug` in Sentry and `JUNEBUG_MESSAGE` in `audit_logs`.
3. **Step C — Everyone.** Flip `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=true` in **Production**. The beta domain var becomes a no-op; leave it configured so we can revert to internal-only without a code change.
4. **PR 4 cleanup.** Two weeks after Step C lands with no regression, delete both env vars and the legacy chat-panel code.

### Emergency rollback

Flip `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=false` in Production. Redeploy. All users see the legacy FAB again. Existing Junebug threads / messages stay in the DB — the workspace just becomes unreachable.

---

## Observability

### Sentry (`@sentry/nextjs`)

All AI-path errors emit with structured tags. Filter the dashboard by:

| Tag filter | What you get |
|---|---|
| `tag:junebug` | Every Junebug failure (stream, completion, CRUD, cleanup) |
| `tag:junebug = stream-failed` | Just Claude streaming failures mid-response |
| `tag:junebug = completion-failed` | Closer to the Anthropic boundary |
| `tag:junebug = cleanup-failed` | Nightly cron sweeps that errored |
| `tag:junebug = thread-get-failed` | 500s on the thread detail route |
| `tag:route` | Every instrumented route, not just Junebug |

User identity: `user.id` is set to the practitioner's userId (never name / email). Use this to ask "did one practitioner cause a burst of failures?"

### Audit log (`audit_logs` table)

Forensic query surface. Every Junebug write operation appears here. Typical queries:

```sql
-- Every thread a practitioner deleted in the last 30 days, with messageCount
SELECT created_at, metadata
FROM audit_logs
WHERE action = 'JUNEBUG_THREAD_DELETED'
  AND practitioner_id = $1
  AND created_at > now() - interval '30 days';

-- Was the context guardrail ever triggered on this case?
SELECT * FROM audit_logs
WHERE action = 'JUNEBUG_THREAD_CONTEXT_UNAVAILABLE'
  AND case_id = $1;
```

7-year retention per SOC 2. See `src/lib/data-retention.ts`.

### Health endpoint

`GET /api/health` — JSON with status, Git SHA, DB round-trip latency, env var presence. 200 when healthy, 503 when any required check fails. Public; uptime monitors can hit it without auth.

---

## Rate limits

In-memory per-instance (not Redis — see the docstring in `src/lib/rate-limit.ts`):

| Tier | Limit | Applies to |
|---|---|---|
| `junebugSend` | 60 / hour per user | `POST /api/junebug/threads/[id]/messages` |
| `junebugBurst` | 15 / minute per user | Same route (burst ceiling stacks with sustained) |
| `tasteSignal` | 30 / 5-minute per user | `POST /api/tax-authority/preference` |
| `aiAnalysis` | 20 / hour per user | `POST /api/ai/analyze` |

429 responses include `Retry-After` and `X-RateLimit-*` headers. **If a practitioner legitimately hits a limit:** raise the tier via code change + redeploy. There is no runtime override today.

---

## Cron jobs (Vercel-scheduled, see `vercel.json`)

| Path | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/refresh-intelligence` | `0 */6 * * *` | Hourly case-intelligence refresh |
| `/api/cron/tax-authority/daily-harvest` | `0 9 * * 1-6` | Mon-Sat morning tax-authority pull |
| `/api/cron/tax-authority/weekly-irb` | `0 8 * * 1` | Monday IRB harvest |
| `/api/cron/tax-authority/weekly-reconcile` | `0 9 * * 0` | Sunday citation-graph reconcile |
| `/api/cron/tax-authority/weekly-gaps` | `0 11 * * 1` | Pippen Phase 2 gap report |
| `/api/cron/tax-authority/benchmark-replay` | `0 13 * * *` | Daily benchmark re-run |
| `/api/cron/tax-authority/daily-digest` | `0 14 * * *` | Daily Pippen digest compose |
| `/api/cron/scan-implementations` | `0 12 * * *` | Daily IRS implementation scan |
| `/api/cron/junebug/cleanup` | `0 7 * * *` | Junebug empty-thread sweep |

All cron endpoints require `Authorization: Bearer $CRON_SECRET`.

---

## Common incident playbooks

### "Junebug is broken for everyone"

1. Check `GET /api/health` — is DB reachable? Env vars present?
2. Check Vercel deployments — did a recent deploy fail or enter an error loop?
3. Check Sentry `tag:junebug` in the last 15 min — what's the error spike look like?
4. If completions are failing but everything else is fine: Anthropic outage. Check https://status.anthropic.com.
5. Worst case: flip `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=false` via Vercel env var and redeploy. The legacy chat panel comes back on flag-off.

### "AI spend is off the charts"

1. Check rate-limit 429s in Sentry — is someone legitimately at cap? Is the cap too low?
2. Query `audit_logs` for `action = 'JUNEBUG_MESSAGE'` grouped by practitioner + day. Any obvious outliers?
3. Tighten the tier in `src/lib/rate-limit.ts` and redeploy. In-memory store resets on deploy, so no client is punished past the next cold start.

### "A practitioner reported their data showed up in someone else's thread"

This is a **P0 cross-tenant incident.** Full playbook:

1. DO NOT dismiss. Take it seriously.
2. Get the two threadIds involved. Get both practitioners' userIds.
3. Query `SELECT id, user_id, created_at FROM junebug_threads WHERE id IN ($1, $2)`.
4. If both threads have the same `user_id`, it's not cross-tenant — the practitioner may have confused accounts.
5. If they have different `user_id`s AND the reporting practitioner was able to read the other thread, `requireOwnedThread` has been breached. The relevant tests are in `src/lib/junebug/thread-access.test.ts` — run them and note any failures.
6. Preserve the audit log rows before rotating anything. Do not delete the threads; the data is the evidence.
7. Notify legal / SOC 2 incident coordinator per `docs/soc2-*`.

---

## Deploy checklist (before merging to main)

- [ ] CI green (tests + type check + lint)
- [ ] No new `console.log` / `console.error` statements calling the user's data
- [ ] Every new API route uses `requireAuth` or `requireJunebugSession`
- [ ] Every new user-mutation has an audit log call
- [ ] No new deps that aren't in `serverComponentsExternalPackages` pushed the preview-pdf bundle over 280MB (see Vercel build log)

---

*Last reviewed: 2026-04-17.*
