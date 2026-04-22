# Junebug Threads — Product Spec for Claude Code

**Status:** Shipped. PRs 1–5 landed A4.7 behind a feature flag; the staged
rollout and legacy cleanup (PR 6) retired both the flag and the old
chat-panel FAB. Document retained as historical reference for the §6.X
API contracts, §11 acceptance checklist, and the tokenization / PII
rules the implementation still honors.
**Owner:** Cleared Engineering
**Scope:** Convert Junebug from a single-session chat widget into a persistent, multi-thread AI workspace modeled on Claude.ai's conversation pattern.
**Priority:** P0 — foundational for the dashboard bifurcation initiative and the "gets smarter over time" product thesis.
**Tracked in TASKS.md as:** A4.7

---

## 1. Why this work exists

Today, Junebug stores chat history in `sessionStorage`. Close the tab and everything is gone. There is one rolling buffer. "New conversation" wipes it. The assistant is useful for a single question, then amnesic.

That is wrong for the product we're building. Practitioners work cases over weeks. They come back to the same issue. They want to reread what Junebug told them three days ago, edit a follow-up, branch off a new thread. They expect Junebug to know the difference between a conversation about CLR-2026-04-0123's OIC and a conversation about penalty abatement for a different client.

This spec converts Junebug to a **persistent, multi-thread workspace** with the interaction pattern from Claude.ai: thread list in a left rail grouped by recency, threads survive sessions, each thread is scoped (general or case-bound), titles auto-generate from the first message, threads can be renamed, pinned, archived, and searched.

This is the foundation for everything else on the Junebug roadmap. Do this first; do it properly; do not shortcut persistence because sessionStorage "works."

---

## 2. Outcome (what "done" looks like)

A practitioner can:

1. Open Junebug and see a list of their prior threads, grouped by **Today / Yesterday / Previous 7 Days / Previous 30 Days / Older**.
2. Click a thread and resume the conversation exactly where it left off — full message history, case context, loaded artifacts.
3. Start a new thread from the list or via a "New conversation" button; it appears in the list immediately after the first message.
4. See auto-generated thread titles after the first user message; edit the title inline.
5. Pin threads to the top of the list. Archive threads to hide them. Delete threads permanently (with confirmation).
6. Search across all their threads by message content.
7. On a case detail page, Junebug defaults to showing threads scoped to that case, with a toggle for "All threads" vs "This case only."
8. See a small, clickable **context chip** at the top of each thread showing what Junebug has access to (case number, doc count, recent review actions) — so practitioners can verify what the AI actually saw.
9. Close the browser, return a week later, and everything is intact.

What the engineer should *not* build in this PR (tracked separately):

- The dashboard bifurcation layout (50/50 split with the feed). That's a later PR; this one stands alone.
- Artifacts side panel (extracting generated documents out of the chat stream). Later.
- Thread branching / forking. Later.
- Always-on left rail across the whole app. Later.
- Sharing threads with other practitioners. Later.

The deliverable is: Junebug works like Claude.ai conversations. Nothing more. Nothing less.

---

## 3. Non-goals and guardrails

- **Do not remove the existing `sessionStorage` chat logic in a separate commit.** Keep the old behavior reachable via a feature flag (`JUNEBUG_THREADS_ENABLED`) for one release cycle so we can roll back if anything goes sideways with real traffic.
- **Do not break the existing `/api/ai/chat` route contract.** The route will be extended, not replaced. Downstream callers (the chat panel today, plus any internal tooling) must keep working.
- **Do not log raw PII.** Follow the existing tokenizer pattern. Thread message content is stored *decrypted* in Postgres (same trust boundary as other case data), but any AI API transmission must go through `tokenizeText` / `detokenizeText` as it does today.
- **Do not introduce a new state management library.** React state + server round-trips only. No Zustand, Redux, or similar.
- **Do not use browser storage (localStorage/sessionStorage) as a cache for thread data.** All thread state lives in Postgres. The client fetches and displays; the server is source of truth. This is a deliberate departure from the current pattern.
- **Match existing visual language.** Instrument Serif for titles, JetBrains Mono for metadata, font weights capped at 500, existing CSS variables (`--c-gold`, `--c-gray-100`, etc.). No new color palette.

---

## 4. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  JunebugWorkspace (new client component)                        │
│                                                                 │
│  ┌────────────────────┐  ┌──────────────────────────────────┐   │
│  │ ThreadSidebar      │  │ ThreadView                       │   │
│  │  - Thread groups   │  │  - Context chip                  │   │
│  │  - Search          │  │  - Message stream                │   │
│  │  - Filter (case)   │  │  - Composer                      │   │
│  │  - New thread      │  │                                  │   │
│  └────────────────────┘  └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
  ┌────────────────────────┐   ┌────────────────────────────────┐
  │ /api/junebug/threads   │   │ /api/junebug/threads/:id/      │
  │  GET  (list)           │   │   messages (POST — send)       │
  │  POST (create)         │   │   (GET — paginate history)     │
  │  PATCH (update)        │   │ /api/junebug/threads/:id       │
  │  DELETE                │   │   GET, PATCH, DELETE           │
  └────────────────────────┘   └────────────────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
                  ┌───────────────────┐
                  │ Prisma / Postgres │
                  │                   │
                  │ JunebugThread     │
                  │ JunebugMessage    │
                  │ JunebugAttachment │
                  └───────────────────┘
```

The existing `/api/ai/chat` route keeps its current shape. The new `POST /api/junebug/threads/:id/messages` route wraps it: it persists the user message, calls `/api/ai/chat` internally (or the same handler logic factored into a shared function), streams the assistant response back while persisting it chunk-by-chunk, and returns the completed thread state.

---

## 5. Database schema

Add these models to `prisma/schema.prisma`. Follow the existing conventions (`@@map` to snake_case table names, `cuid()` IDs, `@default(now())` timestamps, `@updatedAt`, indexed foreign keys).

### 5.1 `JunebugThread`

```prisma
model JunebugThread {
  id              String               @id @default(cuid())
  userId          String
  user            User                 @relation("JunebugThreadOwner", fields: [userId], references: [id], onDelete: Cascade)

  // Optional case scoping
  caseId          String?
  case            Case?                @relation("JunebugThreadCase", fields: [caseId], references: [id], onDelete: SetNull)

  // Display
  title           String               // auto-generated from first message; editable
  titleAutoGenerated Boolean           @default(true)  // false once user edits

  // Status
  pinned          Boolean              @default(false)
  archived        Boolean              @default(false)

  // Rolling summary for long threads (fills in when > 40 messages)
  summary         String?              @db.Text

  // Timestamps
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  lastMessageAt   DateTime             @default(now())  // for sorting

  // Relations
  messages        JunebugMessage[]

  @@index([userId, archived, lastMessageAt(sort: Desc)])
  @@index([userId, caseId, archived])
  @@index([userId, pinned, archived])
  @@map("junebug_threads")
}
```

### 5.2 `JunebugMessage`

```prisma
model JunebugMessage {
  id          String                @id @default(cuid())
  threadId    String
  thread      JunebugThread         @relation(fields: [threadId], references: [id], onDelete: Cascade)

  role        JunebugMessageRole    // USER | ASSISTANT | SYSTEM
  content     String                @db.Text

  // AI metadata — only populated for ASSISTANT messages
  model       String?               // e.g. "claude-opus-4-6"
  tokensIn    Int?
  tokensOut   Int?
  durationMs  Int?

  // Live context snapshot at the moment this message was sent
  // Useful for audit trail: "what did Junebug actually see when it answered?"
  contextSnapshot Json?             // { caseId, caseNumber, docCount, kbHits, ... }

  // Attachments (file uploads sent with this message)
  attachments JunebugAttachment[]

  // Error state — if the AI call failed, we still persist the user's message
  // and create an ASSISTANT message with errorMessage set
  errorMessage String?              @db.Text

  createdAt   DateTime              @default(now())

  @@index([threadId, createdAt])
  @@map("junebug_messages")
}

enum JunebugMessageRole {
  USER
  ASSISTANT
  SYSTEM
}
```

### 5.3 `JunebugAttachment`

```prisma
model JunebugAttachment {
  id          String          @id @default(cuid())
  messageId   String
  message     JunebugMessage  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  // Either a pointer to an existing case document, or a standalone upload
  documentId  String?         // references Document.id when attached from case
  fileName    String
  fileUrl     String          // S3 URL or local path in dev
  fileType    String
  fileSize    Int

  createdAt   DateTime        @default(now())

  @@index([messageId])
  @@map("junebug_attachments")
}
```

### 5.4 Relations to add on existing models

On `User`:

```prisma
junebugThreads  JunebugThread[]  @relation("JunebugThreadOwner")
```

On `Case`:

```prisma
junebugThreads  JunebugThread[]  @relation("JunebugThreadCase")
```

### 5.5 Migration

Generate with `npx prisma migrate dev --name add_junebug_threads`. The migration must be safe on production — all new tables, no destructive changes to existing data. Verify by running against a clone of prod.

---

## 6. API routes

All routes live under `/api/junebug/`. All require authentication; all scope by `session.user.id`. Unauthorized access returns 401. Attempts to access another user's thread return 404 (not 403 — don't leak existence).

### 6.1 `GET /api/junebug/threads`

List the current user's threads. Supports filtering and pagination.

**Query params:**

- `archived` — `true` | `false` (default: `false`)
- `caseId` — optional; when set, returns only threads scoped to that case
- `pinnedOnly` — `true` | `false` (default: `false`)
- `search` — optional; full-text search across message content (see §6.1.1)
- `cursor` — optional; for pagination
- `limit` — optional; default 30, max 100

**Response:**

```ts
{
  threads: Array<{
    id: string
    title: string
    titleAutoGenerated: boolean
    caseId: string | null
    caseNumber: string | null       // decrypted, from Case.tabsNumber
    clientName: string | null       // decrypted via decryptField
    pinned: boolean
    archived: boolean
    lastMessageAt: string           // ISO
    createdAt: string
    messageCount: number            // computed via _count
    lastMessagePreview: string      // first ~120 chars of last message
    lastMessageRole: "USER" | "ASSISTANT" | "SYSTEM"
  }>
  nextCursor: string | null
}
```

**Grouping:** the server does not group. The client groups by `lastMessageAt` into the time buckets defined in §7.3.

**Sorting:** pinned threads first (pinned + lastMessageAt desc), then unpinned by lastMessageAt desc.

#### 6.1.1 Search

When `search` is provided, perform a full-text match against `JunebugMessage.content` restricted to threads owned by the current user. Use Postgres `to_tsvector('english', content) @@ plainto_tsquery('english', $1)`. Return threads ordered by relevance (`ts_rank_cd`) and break ties by `lastMessageAt`. Add a GIN index on `JunebugMessage.content` as part of this migration:

```sql
CREATE INDEX junebug_messages_content_fts
  ON junebug_messages
  USING GIN (to_tsvector('english', content));
```

Include this as raw SQL in the Prisma migration.

### 6.2 `POST /api/junebug/threads`

Create a new, empty thread. Returns the thread immediately with a placeholder title ("New conversation"). The title is replaced with an AI-generated summary after the first user message arrives (see §6.5).

**Body:**

```ts
{
  caseId?: string   // optional case scoping
}
```

**Response:** the created `JunebugThread` in the same shape as list items in §6.1.

### 6.3 `GET /api/junebug/threads/:id`

Return a single thread with its full message history and the current context snapshot.

**Query params:**

- `messagesLimit` — default 100; max 500. Messages returned most-recent-last.
- `messagesCursor` — optional; for paginating backward through older messages.

**Response:**

```ts
{
  thread: {
    id, title, titleAutoGenerated, caseId, caseNumber, clientName,
    pinned, archived, lastMessageAt, createdAt, summary
  }
  messages: Array<{
    id, role, content, model, tokensIn, tokensOut, durationMs,
    contextSnapshot, errorMessage, createdAt,
    attachments: Array<{ id, fileName, fileUrl, fileType, fileSize }>
  }>
  hasMoreMessages: boolean
  oldestMessageCursor: string | null
}
```

If the thread doesn't exist or belongs to another user: **404**, no body.

### 6.4 `PATCH /api/junebug/threads/:id`

Update thread metadata. Any subset of fields may be provided.

**Body:**

```ts
{
  title?: string       // user is renaming; also sets titleAutoGenerated = false
  pinned?: boolean
  archived?: boolean
  caseId?: string | null  // re-scope a thread (rare, allow it)
}
```

**Response:** updated thread metadata (same shape as list item).

### 6.5 `DELETE /api/junebug/threads/:id`

Permanent delete. Cascades to messages and attachments. Require the request to include a header `X-Confirm-Delete: true` to prevent accidental calls. If missing, return 400.

Returns 204 on success.

### 6.6 `POST /api/junebug/threads/:id/messages`

The main message-send endpoint. Persists the user message, invokes the AI, streams the assistant response back to the client while persisting chunks to the database, and returns the final message.

**Body:**

```ts
{
  content: string
  attachments?: Array<{
    documentId?: string   // reference to existing case doc
    fileName: string
    fileUrl: string
    fileType: string
    fileSize: number
  }>
  model?: string                         // default: "claude-opus-4-6"
  fullFetch?: boolean                    // existing Junebug feature
  pageContext?: unknown                  // existing Junebug feature
  currentRoute?: string                  // existing Junebug feature
}
```

**Behavior:**

1. Validate thread ownership. 404 if not current user's.
2. Insert a `JunebugMessage` row with `role: USER` and the provided content/attachments.
3. Load the thread's full message history (respecting the rolling summary — see §6.5.1).
4. Resolve case context if the thread has `caseId`, using `getCaseContextPacket` exactly as the existing chat route does.
5. Construct the contextSnapshot for this message (case info, doc count, KB hits, current route). Persist it onto the USER message immediately — this is the record of what Junebug had access to.
6. Call the existing AI pipeline (factor the body of `/api/ai/chat` POST into a shared helper `runJunebugCompletion()` that both routes use). Stream the response back via SSE.
7. As tokens stream, accumulate them; when complete, insert an `ASSISTANT` message with the full content, `model`, `tokensIn`, `tokensOut`, `durationMs`.
8. If the AI call fails, still insert an ASSISTANT message with `errorMessage` set and `content: ""`. This ensures the thread never has a dangling USER message with no reply.
9. Update `JunebugThread.lastMessageAt` and `updatedAt`.
10. If this was the first user message in the thread AND `titleAutoGenerated` is true, fire an async (non-blocking) title-generation call using Haiku (see §6.5.2). Patch the thread title when it returns.

**Response format (streaming):** use the same SSE format the current chat route uses, with these event types:

```
event: meta
data: { "userMessageId": "...", "assistantMessageId": "..." }

event: delta
data: { "content": "partial text..." }

event: done
data: { "message": { ...full assistant message... }, "thread": { ...updated thread meta... } }

event: error
data: { "error": "...", "assistantMessageId": "..." }
```

#### 6.5.1 Rolling summarization for long threads

Once a thread exceeds 40 messages, we must avoid sending the full history on every turn. Strategy:

- When the message count crosses 40, spin up a background job to summarize messages 1–20 using Claude Haiku into a 300-token synopsis stored in `JunebugThread.summary`.
- On subsequent turns, the prompt is built as: `[system prompt] + "Earlier in this conversation:" + summary + [messages 21..end]`.
- Re-run summarization every 20 additional messages: recompute using the existing summary + the next 20.

This keeps prompt size bounded without losing the thread's arc. Users don't see the summary; it's purely a compression layer.

#### 6.5.2 Title generation

After the first user message is persisted, send an async request to Claude Haiku:

```
System: Generate a 3-7 word title summarizing this question.
Return only the title text, no quotes, no punctuation at the end.

User: {first_user_message}
```

Patch the thread's `title` with the result. If it fails, leave the placeholder. This call is non-blocking — if it takes 2 seconds, the UI has already moved on; the title updates via a later refetch or a websocket-free polling tick (see §7.6).

### 6.7 `POST /api/junebug/threads/:id/messages/:messageId/regenerate`

Regenerate an assistant response. Deletes the assistant message and all messages after it in the thread, then re-runs the completion against the truncated history.

Only assistant messages can be regenerated. Attempts on user messages return 400.

---

## 7. Frontend components

Build in `src/components/junebug/` as a new namespace. Do not modify `src/components/assistant/chat-panel.tsx` in this PR except to add the feature flag gate.

### 7.1 Component tree

```
src/components/junebug/
├── junebug-workspace.tsx        # Top-level layout, holds active thread state
├── thread-sidebar.tsx           # Left rail: groups + search + new thread
├── thread-list-item.tsx         # Single thread row in the sidebar
├── thread-group-header.tsx      # "Today", "Yesterday", etc.
├── thread-view.tsx              # Right: context chip + messages + composer
├── thread-context-chip.tsx      # The clickable snapshot chip at the top
├── thread-empty-state.tsx       # When no threads exist
├── message-list.tsx             # Renders messages, handles pagination up
├── message-bubble.tsx           # Single message (user or assistant)
├── message-composer.tsx         # Textarea + send button + attachment picker
├── thread-header-menu.tsx       # Rename / pin / archive / delete dropdown
└── hooks/
    ├── use-threads.ts           # Fetch + mutate thread list
    ├── use-thread.ts            # Fetch + mutate single thread
    └── use-send-message.ts      # Stream a message, handle SSE
```

### 7.2 `JunebugWorkspace`

**Props:**

```ts
{
  initialThreadId?: string   // optional deep link
  scopeToCaseId?: string     // when embedded on a case page
  currentUser: { id: string; name: string; role: string }
}
```

**State:**

- `activeThreadId: string | null`
- `sidebarCollapsed: boolean` (default false desktop, true mobile)
- `searchQuery: string`
- `showArchived: boolean`
- `caseScopeFilter: "all" | "current_case" | "no_case"` (only matters when `scopeToCaseId` is provided)

**Layout:** CSS grid, two columns. Sidebar is 280px fixed on desktop, full-width overlay on mobile. Use existing Tailwind breakpoints.

### 7.3 `ThreadSidebar`

**Responsibilities:**

- Render a "New conversation" button at the top (pins to sidebar).
- Render a search input below it.
- Render filter toggles when applicable (case scope, show archived).
- Fetch threads via `useThreads()`.
- Group threads into **Pinned**, **Today**, **Yesterday**, **Previous 7 Days**, **Previous 30 Days**, **Older**.
- Grouping logic uses the practitioner's local timezone (read from user settings; default Central Time per task A6.5).
- Each group has a header with count badge.
- Empty state: "No conversations yet. Ask Junebug anything to get started."
- When search is active, don't group — show a flat ranked list with highlighted matches.

**New conversation flow:** clicking the button calls `POST /api/junebug/threads` with the current case scope (if any), then navigates to the new thread in the right pane. Don't persist the thread server-side until the user actually sends a message — **correction**: do persist it immediately (see §6.2). We show an empty thread and the user can either type or back out. If they leave without sending, a server-side cleanup job (§10.2) deletes empty threads older than 24 hours.

### 7.4 `ThreadListItem`

```
┌─────────────────────────────────────┐
│ 📌 OIC analysis for Smith           │   ← title, truncate to 1 line
│    CLR-2026-04-0123 · 2h ago        │   ← case chip + relative time
│    "Last message preview text..."   │   ← last message, 1 line
└─────────────────────────────────────┘
```

- Pin icon shows when pinned.
- Case chip is clickable and jumps to the case (separate nav action, don't swallow the row click).
- Row click sets `activeThreadId`.
- Hover reveals a `...` menu: Pin/Unpin, Rename, Archive, Delete.
- Active thread has a subtle background (`--c-gray-50` or equivalent) and a 2px left accent in `--c-gold`.

### 7.5 `ThreadView`

**Responsibilities:**

- If no `activeThreadId`, show a splash: Junebug icon, "What can I help you work on?" headline in Instrument Serif, a large composer with suggested prompts (keep the existing `getSuggestions()` logic from `chat-panel.tsx`). Sending a message from this splash creates a new thread and switches to it.
- If a thread is active, fetch via `useThread()` and render: `ThreadContextChip` → `MessageList` → `MessageComposer`.
- Handle scroll-to-bottom on new messages; preserve scroll position when paginating older messages upward.

### 7.6 `ThreadContextChip`

The small clickable chip at the top. Shows what Junebug has access to in this thread's current turn.

```
┌─────────────────────────────────────────┐
│ 🔎 CLR-2026-04-0123 · 7 docs · OIC      │
└─────────────────────────────────────────┘
```

Clicking expands into a panel listing:

- Case number (if scoped), client name, case type, status
- Number of uploaded documents and their categories
- Number of KB chunks Junebug can currently search
- Current route context
- Whether full-fetch mode is active

When no case is scoped: `🔎 General — no case context`.

This is **your accountability surface**. Practitioners review and sign off on AI output; they need to know what the model saw. This is non-negotiable — ship it in v1.

### 7.7 `MessageList`

- Render messages oldest-to-newest.
- Use the existing markdown renderer pattern from `chat-panel.tsx` (`marked` + `DOMPurify`).
- User messages: right-aligned bubble, `--c-gray-100` background, subtle border.
- Assistant messages: full-width prose, no bubble, `junebug-prose` class (existing).
- Error messages (assistant role, `errorMessage` populated): red left border, plain text of the error, "Retry" button that re-runs §6.7.
- Infinite scroll upward: `IntersectionObserver` on a sentinel above the first message; when visible, fetch older messages via `useThread({ before: oldestMessageId })`.
- Stream rendering: while an assistant message is streaming, show it with a subtle pulse animation on the last character.

### 7.8 `MessageComposer`

- Textarea, autosize to a max of ~180px before scrolling internally.
- Enter sends; Shift+Enter inserts newline.
- Attach button: opens a file picker OR a case-document picker (when thread is case-scoped).
- Send button: disabled when input empty or a message is already streaming.
- Show "Junebug is thinking…" with the existing rotating loading messages while streaming.
- After send, optimistically append a USER message to the list before the SSE stream begins.

### 7.9 Hooks

#### `useThreads(filters)`

Returns `{ threads, isLoading, error, mutate }`. Uses `fetch` + a lightweight cache (`useRef` + `useState`; no SWR/React Query unless already in the codebase). Exposes mutators:

- `createThread(caseId?) => Promise<Thread>`
- `updateThread(id, patch) => Promise<Thread>`
- `deleteThread(id) => Promise<void>`

Background refresh: poll every 30 seconds when the tab is visible. Use `document.visibilitychange` to pause when hidden.

#### `useThread(threadId)`

Returns `{ thread, messages, isLoading, error, loadOlder, mutate }`. Refetches when `threadId` changes. `loadOlder()` paginates upward.

#### `useSendMessage(threadId)`

Returns `send(content, attachments?) => Promise<void>`. Opens an SSE connection to `POST /api/junebug/threads/:id/messages`, appends optimistic USER message, streams the ASSISTANT response, updates local state with the final message ID + metadata on `done`.

Must handle:

- Stream disconnect mid-response: save what was streamed, mark message as partial (`errorMessage: "Connection interrupted"`), offer retry.
- Multiple concurrent sends in the same thread: queue, don't parallelize. Claude.ai serializes turns; so do we.
- Cross-thread sends: allowed; user can switch threads while one is streaming. The streaming thread continues in the background; when user returns, they see the completed state.

---

## 8. Feature flag and rollout

Add `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED` to `.env` and `vercel.json` (default `false` in production).

Behavior:

- When `false`: the existing `chat-panel.tsx` FAB and behavior are unchanged. None of the new code is rendered. The schema additions are still deployed (tables just sit empty).
- When `true`: the old chat panel FAB is hidden; a new Junebug entry point opens `JunebugWorkspace` as a full-screen modal (or routes to `/junebug` — see §9). The new API routes are active.

Rollout plan:

1. Merge with flag `false`. Schema migrates. No user-facing change.
2. Flip flag `true` in staging. QA runs the full acceptance checklist (§11).
3. Flip flag `true` for internal users only (gate by `user.email` ending in your firm domain, or by a `JunebugBetaUser` role).
4. Flip flag `true` for everyone. Remove flag in a follow-up PR two weeks later along with `chat-panel.tsx` deletion.

---

## 9. Routing and entry points

Create a new route: `/junebug` → renders `JunebugWorkspace` full-screen. This replaces the FAB-and-popup model.

- `/junebug` → workspace with no active thread (splash screen)
- `/junebug/:threadId` → workspace with that thread active
- `/junebug?case=:caseId` → workspace filtered to that case, new thread ready
- `/junebug/:threadId?case=:caseId` → preserved for deep links

Navigation entry: replace the Junebug FAB with a sidebar nav item "Junebug" that routes to `/junebug`. On case detail pages, add a secondary button "Ask Junebug" that routes to `/junebug?case={caseId}`.

The existing FAB goes away when the flag is on. It was fine for a widget; it's wrong for a workspace.

---

## 10. Server-side utilities

### 10.1 Shared completion helper

Extract the existing body of `/api/ai/chat/route.ts` POST handler into `src/lib/junebug/completion.ts`:

```ts
export async function runJunebugCompletion(params: {
  userId: string
  threadId: string | null   // null for legacy flag-off path
  messages: Array<{ role: string; content: string }>
  caseContext?: CaseContext | null
  model?: string
  fullFetch?: boolean
  pageContext?: unknown
  currentRoute?: string
  onDelta: (text: string) => void | Promise<void>
  onContextSnapshot: (snapshot: object) => void | Promise<void>
}): Promise<{
  finalContent: string
  tokensIn: number
  tokensOut: number
  durationMs: number
  contextSnapshot: object
  error?: string
}>
```

Both `/api/ai/chat` (legacy) and `/api/junebug/threads/:id/messages` (new) call this helper. DRY; no logic duplicated.

### 10.2 Cleanup job

Add a cron route `/api/cron/junebug/cleanup` that runs nightly:

- Delete `JunebugThread` rows where `messages` count is 0 AND `createdAt < now - 24h`.
- Log counts to the existing audit log.

Add to `vercel.json` cron schedule.

### 10.3 Audit logging

For every AI completion call made through `/api/junebug/threads/:id/messages`, create an `AuditLog` entry with:

- `action: "JUNEBUG_MESSAGE"`
- `metadata: { threadId, messageId, model, tokensIn, tokensOut, caseId, contextAvailable }`

This matches the existing audit discipline in `/api/ai/chat`.

---

## 11. Acceptance criteria

Every one of these must pass before the flag is flipped on for real users.

### Persistence

- [ ] Sending a message creates a `JunebugThread` and two `JunebugMessage` rows (USER and ASSISTANT).
- [ ] Closing the browser and returning shows the thread in the sidebar.
- [ ] Messages reappear on thread open in the correct order.
- [ ] Thread title updates to an AI-generated summary within ~5 seconds of the first message.
- [ ] Editing the title sets `titleAutoGenerated` to false and persists.

### Sidebar

- [ ] Threads are grouped by Pinned / Today / Yesterday / Previous 7 / Previous 30 / Older in the practitioner's local timezone.
- [ ] New threads appear in Today immediately after first message send.
- [ ] Pin moves a thread to the Pinned group and adds the pin icon.
- [ ] Archive hides a thread; toggling "Show archived" reveals it with reduced opacity.
- [ ] Delete requires confirmation, then removes the thread and its messages permanently.

### Search

- [ ] Searching for a term present in a past message returns the thread(s) containing it.
- [ ] Search highlights the matched term in the preview line.
- [ ] Empty search restores the grouped view.

### Case scoping

- [ ] On `/junebug?case=:caseId`, the sidebar defaults to "This case only" and the new-thread button creates a case-scoped thread.
- [ ] Switching to "All threads" shows unfiltered list.
- [ ] A thread's case chip jumps to the case detail page.
- [ ] Threads without a case show a general chip; the context chip reads "General — no case context."

### Context chip

- [ ] When a thread is case-scoped and case data loaded, the chip shows case number, doc count, case type.
- [ ] When context load fails, chip reads "General — no case context" and the assistant's guardrail message (existing A4.1 behavior) fires.
- [ ] Clicking the chip expands the detailed context panel.

### Streaming

- [ ] Assistant responses stream token-by-token into the view.
- [ ] Streaming can be interrupted by navigating to another thread; the original thread continues streaming in the background.
- [ ] Returning to the streaming thread shows the completed message.
- [ ] A failed completion persists the USER message and an ASSISTANT error message; the Retry button re-runs the turn.

### Performance

- [ ] Thread list loads in < 400ms for a user with 200 threads.
- [ ] Opening a thread with 100 messages renders in < 600ms.
- [ ] Long threads (200+ messages) use the rolling summary; prompt token count stays under 40k.

### Safety

- [ ] No PII written to any log — only `threadId`, `messageId`, counts.
- [ ] All new API routes require session auth; another user's thread ID returns 404.
- [ ] Delete requires the `X-Confirm-Delete: true` header.
- [ ] Feature flag off → zero user-facing change, zero new code paths executed.

### Observability

- [ ] Every message send generates an `AuditLog` entry.
- [ ] Stream failures are captured in Sentry with `threadId` tag.
- [ ] Cleanup cron logs its deletion counts.

---

## 12. Visual design notes

Match the existing design system. Specifics:

- **Typography.** Thread titles in sidebar: Instrument Serif, 15px, weight 400. Message prose: existing `junebug-prose` class. Metadata (timestamps, case numbers): JetBrains Mono, 11px, uppercase, letter-spacing 0.04em, color `--c-gray-500`.
- **Colors.** Use `--c-gold` for the active-thread accent and the pin icon. `--c-gray-50` for active row background. `--c-gray-100` for borders. White for surfaces. No new tokens.
- **Spacing.** Sidebar: 16px horizontal padding, 12px between rows. Thread view: 32px horizontal padding on desktop, 16px on mobile. 24px vertical gap between messages.
- **Iconography.** Use `lucide-react` icons already in the project. New conversation: `Plus`. Search: `Search`. Pin: `Pin` / `PinOff`. Archive: `Archive`. Menu: `MoreHorizontal`. Context chip: `Radar` or `ScanSearch`.
- **Motion.** Existing page transitions + a subtle fade when switching threads (200ms). No layout-shift on thread open; reserve space for context chip before content loads.

Do not invent new patterns. If it's not obvious how something should look, copy from the existing case detail page or review queue.

---

## 13. Known trade-offs and open questions

**Background streaming when user switches threads.** The spec says the original thread continues streaming. This requires holding the SSE connection open server-side even after the client navigates away. Implementation option: keep the `fetch` promise alive in a module-level Map keyed by `threadId`; when the user returns to that thread, reattach the UI to the same in-memory state. If this is too complex for v1, the simpler behavior is: switching threads aborts the stream, persists what was received as a partial ASSISTANT message, and lets the user retry. **Default to the simpler behavior in v1 unless the engineer sees a clean path to the better one.**

**Title generation latency.** Haiku for a 7-word title should return in ~1–2 seconds. If we see slower, fall back to: first 60 characters of the user message, truncated at a word boundary. This is fine as a permanent fallback.

**Thread search scope.** v1 searches message content only. Title search is covered by substring match in the grouped view's filter. A future enhancement searches `contextSnapshot` to let users find "the conversation where Junebug had 7 documents loaded" — not for now.

**Mobile.** The spec describes mobile responsiveness at a high level but does not specify every breakpoint. Use the existing project mobile patterns (the dashboard shell already handles this). If anything feels unresolved, copy the case detail page's mobile behavior.

---

## 14. Work breakdown

Suggested PR sequence if splitting the work:

1. **Schema + migrations** — models, indexes, GIN FTS index. (1 PR, small.)
2. **API routes** — all six, with the shared `runJunebugCompletion()` helper. Unit-test each route. (1 PR, medium.)
3. **Core components** — `JunebugWorkspace`, `ThreadSidebar`, `ThreadView`, `MessageList`, `MessageComposer`. Feature flag gate. (1 PR, large.)
4. **Context chip + title generation + rolling summary** — the polish layer. (1 PR, medium.)
5. **Routing, nav integration, cleanup cron** — wire it into the app. (1 PR, small.)
6. **Legacy cleanup** — delete `chat-panel.tsx` and the FAB, remove the flag. (Follow-up, 2 weeks after rollout.)

If doing it in one PR, the order within the PR should still follow this sequence. Don't start on components before the API is working end-to-end against curl.

---

## 15. What to push back on

If during implementation the engineer hits friction on any of the following, **stop and flag it** rather than ship a worse version:

- If `runJunebugCompletion()` can't cleanly extract from `/api/ai/chat` without duplicating 80% of its logic, the refactor is bigger than this PR. Ship with duplication and file a separate refactor task.
- If Postgres FTS on `content` isn't delivering relevant results (tokenization is bad for tax jargon, for instance), consider adding a `searchVector` column with custom weighting, or defer search to v2.
- If streaming through SSE plus persistence creates ordering bugs (assistant message ID not available until stream completes), the `meta` event at stream start that returns `assistantMessageId` is the solution — but make sure the ID is reserved server-side before streaming begins.
- If rolling summarization introduces content drift in long threads (summaries losing key case facts), consider raising the threshold from 40 to 80 messages before summarizing, or exclude the summary and rely on context truncation instead. Measure before choosing.

---

## 16. Definition of done

- [ ] All acceptance criteria in §11 pass in staging.
- [ ] Code reviewed by one other engineer.
- [ ] PROGRESS.md updated with a dated entry describing what shipped.
- [ ] TASKS.md updated: mark the relevant P0/P1 tasks complete; add any follow-up tasks discovered during implementation.
- [ ] Feature flag flipped to `true` for internal users; one week of dogfooding logged.
- [ ] No increase in AI API error rate vs. the prior week's baseline.
- [ ] No new Sentry issues in the `junebug` tag with severity ≥ warning.

When all of the above is true, the flag flips to `true` for everyone and v1 is done.

---

*End of spec.*
