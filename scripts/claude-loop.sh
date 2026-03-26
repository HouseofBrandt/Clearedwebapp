#!/bin/bash
# Cleared — Continuous Development Loop
# Usage: ./scripts/claude-loop.sh [--iterations N] [--duration HOURS] [--max-cost USD]
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────
MAX_ITERATIONS=${MAX_ITERATIONS:-50}
MAX_DURATION_HOURS=${MAX_DURATION_HOURS:-6}
MAX_COST=${MAX_COST:-75}
PAUSE_SECONDS=${PAUSE_SECONDS:-5}
PROMPT_FILE="scripts/loop-prompt.md"

# ── Parse Args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --iterations) MAX_ITERATIONS="$2"; shift 2;;
    --duration) MAX_DURATION_HOURS="$2"; shift 2;;
    --max-cost) MAX_COST="$2"; shift 2;;
    --pause) PAUSE_SECONDS="$2"; shift 2;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

# ── Setup ─────────────────────────────────────────────────────────
START_TIME=$(date +%s)
MAX_DURATION_SECONDS=$((MAX_DURATION_HOURS * 3600))
ITERATION=0
LOG_DIR="logs/claude-loop"
mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Cleared — Continuous Development Loop          ║"
echo "║  Max Iterations: $MAX_ITERATIONS                          ║"
echo "║  Max Duration:   ${MAX_DURATION_HOURS}h                             ║"
echo "║  Max Cost:       \$$MAX_COST                            ║"
echo "║  Started:        $(date '+%Y-%m-%d %H:%M:%S')       ║"
echo "╚══════════════════════════════════════════════════╝"

# ── Main Loop ─────────────────────────────────────────────────────
while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  ELAPSED=$(( $(date +%s) - START_TIME ))

  # Time guard
  if [ $ELAPSED -ge $MAX_DURATION_SECONDS ]; then
    echo "⏰ Duration limit reached (${MAX_DURATION_HOURS}h). Stopping."
    break
  fi

  REMAINING=$(( (MAX_DURATION_SECONDS - ELAPSED) / 60 ))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Iteration $ITERATION/$MAX_ITERATIONS | Elapsed: $((ELAPSED/60))m | Remaining: ${REMAINING}m"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run Claude Code with the prompt file
  LOG_FILE="$LOG_DIR/iteration-${ITERATION}-$(date +%Y%m%d-%H%M%S).log"

  claude -p "$(cat $PROMPT_FILE)" \
    --dangerously-skip-permissions \
    --max-turns 50 \
    2>&1 | tee "$LOG_FILE"

  EXIT_CODE=${PIPESTATUS[0]}

  if [ $EXIT_CODE -ne 0 ]; then
    echo "⚠️  Iteration $ITERATION exited with code $EXIT_CODE"
    echo "$(date): Iteration $ITERATION failed (exit $EXIT_CODE)" >> "$LOG_DIR/errors.log"
  fi

  # Check if all tasks are complete
  if grep -q "ALL_TASKS_COMPLETE" PROGRESS.md 2>/dev/null; then
    echo ""
    echo "✅ All tasks complete! Stopping loop."
    break
  fi

  # Pause between iterations
  echo "  Pausing ${PAUSE_SECONDS}s before next iteration..."
  sleep $PAUSE_SECONDS
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Loop Complete                                  ║"
echo "║  Iterations: $ITERATION                                  ║"
echo "║  Duration:   $(( ($(date +%s) - START_TIME) / 60 )) minutes                        ║"
echo "║  Logs:       $LOG_DIR/                         ║"
echo "╚══════════════════════════════════════════════════╝"
