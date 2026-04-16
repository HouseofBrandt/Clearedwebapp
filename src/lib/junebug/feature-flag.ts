/**
 * Junebug Threads feature flag (A4.7).
 *
 * While the flag is off:
 *   - The existing chat-panel.tsx FAB behaves exactly as before.
 *   - No new code paths execute; no API routes gate on it (they check
 *     themselves), but all new UI stays unmounted.
 *   - The schema additions (junebug_threads / junebug_messages /
 *     junebug_attachments) deploy but sit empty.
 *
 * Flip to "true" in staging first, then internal users, then everyone.
 * See docs/spec-junebug-threads.md §8 for the rollout plan.
 *
 * The flag is NEXT_PUBLIC_ so it's available both server- and client-side;
 * this avoids a hydration mismatch between SSR and client checks. The tiny
 * leak risk (an outside observer can see whether the flag is on) is
 * acceptable for a feature-gating flag like this.
 */

export function junebugThreadsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED === "true"
}
