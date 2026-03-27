#!/usr/bin/env bash
set -euo pipefail

APP_URL="${CLEARED_APP_URL:-https://clearedwebapp.vercel.app}"
SECRET="${FEEDBACK_SYNC_SECRET:-}"
MAX_ITEMS="${1:-5}"

if [ -z "$SECRET" ]; then
  echo "[sync-feedback] FEEDBACK_SYNC_SECRET not set — skipping sync"
  exit 0
fi

echo "[sync-feedback] Syncing feedback to TASKS.md (max $MAX_ITEMS items)..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$APP_URL/api/dev/feedback-sync?maxItems=$MAX_ITEMS" \
  -H "x-feedback-sync-secret: $SECRET" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "[sync-feedback] API returned $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

ITEMS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('itemsSynced',0))" 2>/dev/null || echo "?")
DUPES=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('skippedDuplicates',0))" 2>/dev/null || echo "?")
SHA=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commitSha','none'))" 2>/dev/null || echo "?")

echo "[sync-feedback] Synced: $ITEMS | Skipped duplicates: $DUPES | Commit: $SHA"

if [ "$ITEMS" != "0" ] && [ "$ITEMS" != "?" ]; then
  echo "[sync-feedback] Pulling latest TASKS.md..."
  git pull --rebase origin main 2>/dev/null || echo "[sync-feedback] git pull failed — manual pull needed"
fi
