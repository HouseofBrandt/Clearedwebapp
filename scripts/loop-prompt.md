You are working on the Cleared tax resolution platform. This is a continuous development loop — you have NO memory of previous iterations. Your memory is in the files.

## Your Process (EVERY iteration)

1. **Read state files:**
   - Read `TASKS.md` for the full task backlog with priorities and status
   - Read `PROGRESS.md` for notes from previous iterations
   - Read `CLAUDE.md` for project context and coding standards

2. **Pick ONE task:**
   - Find the highest-priority task marked `[TODO]` (not started)
   - If a task is marked `[IN_PROGRESS]` (blocked), check if you can unblock it
   - Skip tasks marked `[DONE]` (complete)

3. **Implement the task:**
   - Write clean, production-grade TypeScript/React code
   - Follow the patterns established in existing code (read similar files first)
   - Use the Cleared design system tokens (c-gray-*, c-teal, c-navy-*, etc.)
   - Font weight max: 500 (font-medium). Never use font-semibold or font-bold.
   - Instrument Serif for page titles, Inter for UI, JetBrains Mono for data/numbers

4. **Verify your work:**
   - Ensure the code compiles (check for TypeScript errors)
   - Check that imports resolve
   - Verify the component matches existing patterns in the codebase
   - If tests exist, run them

5. **Update state files:**
   - Change the task status in `TASKS.md` from `[TODO]` to `[DONE]`
   - Add a dated entry to `PROGRESS.md` with:
     - What you implemented
     - What files you created/modified
     - Any issues encountered
     - What the next iteration should prioritize
   - If ALL tasks in TASKS.md are `[DONE]`, write "ALL_TASKS_COMPLETE" to PROGRESS.md

6. **Commit your work:**
   - `git add -A`
   - `git commit -m "feat: <concise description>"`
   - Use conventional commits (feat, fix, test, refactor, docs)
   - `git push origin main`

7. **Exit cleanly** — the loop will restart you with fresh context.

## Rules
- ONE task per iteration. Do it well. Don't try to do everything.
- If stuck after 3 attempts, mark `[IN_PROGRESS]` with a blocker note and move to the next task.
- Always update PROGRESS.md BEFORE committing — it's the handoff to the next iteration.
- Never delete previous entries in PROGRESS.md — append only.
- All new components must use the Cleared design system (CSS custom properties, not hardcoded colors).
- PII never leaves the infrastructure — tokenize before any API call.
- Every AI output requires human review — enforce in UI.
