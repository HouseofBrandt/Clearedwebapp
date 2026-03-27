#!/usr/bin/env bash
echo "=== Junebug → Claude Code Feedback Loop Verification ==="
PASS=0; WARN=0; FAIL=0

check() { if [ "$1" = "pass" ]; then echo "  ✅ $2"; ((PASS++)); elif [ "$1" = "warn" ]; then echo "  ⚠️  $2"; ((WARN++)); else echo "  ❌ $2"; ((FAIL++)); fi; }

echo "Environment:"
[ -n "${GITHUB_WRITE_TOKEN:-${GITHUB_TOKEN:-}}" ] && check pass "GITHUB_WRITE_TOKEN set" || check fail "GITHUB_WRITE_TOKEN not set"
[ -n "${FEEDBACK_SYNC_SECRET:-}" ] && check pass "FEEDBACK_SYNC_SECRET set" || check warn "FEEDBACK_SYNC_SECRET not set (sync disabled)"
[ -n "${CLEARED_APP_URL:-}" ] && check pass "CLEARED_APP_URL set" || check warn "CLEARED_APP_URL not set (defaults to vercel)"
[ -n "${ANTHROPIC_API_KEY:-}" ] && check pass "ANTHROPIC_API_KEY set" || check fail "ANTHROPIC_API_KEY not set"

echo "Files:"
for f in src/lib/infrastructure/github-write.ts src/lib/dev/junebug-observer.ts src/lib/dev/feedback-sync.ts src/app/api/dev/feedback-sync/route.ts scripts/sync-feedback.sh scripts/verify-feedback-loop.sh; do
  [ -f "$f" ] && check pass "$f exists" || check fail "$f missing"
done

echo "Integration:"
grep -q "sync-feedback" scripts/claude-loop.sh 2>/dev/null && check pass "claude-loop.sh references sync-feedback" || check warn "claude-loop.sh missing sync-feedback step"
grep -q "Junebug Feedback" scripts/loop-prompt.md 2>/dev/null && check pass "loop-prompt.md references Junebug Feedback" || check warn "loop-prompt.md missing Junebug Feedback section"

echo ""
echo "Results: $PASS passed, $WARN warnings, $FAIL failures"
[ $FAIL -eq 0 ] && echo "✅ Pipeline ready" || echo "❌ Pipeline has failures — fix before running"
