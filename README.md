# ClassSync

**Offline-First Learning Platform** — a complete, runnable, zero-cost prototype where students can download activities, answer them with no internet, and have their work synchronize automatically the moment connectivity returns.

---

## What it is

ClassSync connects teachers and students even when the network doesn't. A teacher creates an activity and publishes it to get a short join code (e.g. `CS-7K4P`). Students enter the code — online it downloads immediately, offline it queues and downloads the moment connectivity returns — and the activity is cached on their device. From then on the student can answer and submit **completely offline** — answers are written to IndexedDB, queued in a sync engine, and uploaded automatically when the connection comes back. The teacher then sees the submission and a server-calculated score.

## Problem

Billions of learners live with unreliable or expensive internet. Typical e-learning tools:

- require a live connection to open an assignment,
- lose answers when the tab refreshes offline,
- silently drop submissions when the network blips,
- or depend on paid cloud services (Firebase, Supabase, hosted LMS) that need a credit card.

Teachers in low-connectivity classrooms need something that **just keeps working**.

## Solution

ClassSync is offline-first by design:

1. **IndexedDB (Dexie)** is the source of truth on the client for cached activities, draft answers, local submissions, and the sync queue.
2. **Optimistic writes** — every answer is persisted immediately, so refreshes and browser restarts never lose work.
3. **Idempotent sync** — each submission carries a `clientSubmissionId`; the server dedupes, so retries can never create duplicates.
4. **Automatic recovery** — `online` events (or toggling off "Simulate offline") drain the queue; failures keep data intact for manual retry.
5. **Server-side grading** — scores are never trusted from the client; the API recalculates them from the answer key.
6. **$0 stack** — React + Vite + Tailwind, Express + SQLite, Dexie, a plain service worker. No paid APIs, no credit card, no cloud account.

---

## Features

### Teacher
- Dashboard: total/active activities, students, pending submissions, recent activity & submissions
- Full activity CRUD: create, edit, delete, publish, view
- Question builder: multiple choice (with correct-answer selection) and short answer, points, optional deadline
- Publish generates a real activity code (`CS-7K4P` reserved for the first publish on a fresh database)
- Submissions inbox with student, activity, status, timestamp, score, sync status
- Submission detail: student answers vs. correct answers, score breakdown
- Per-activity roster: Not Started / In Progress / Submitted

### Student
- Home: active cached activities, recent work, sync status, connection status
- Join by code: works offline — cached codes join instantly, new codes queue and auto-download on reconnect
- Offline activity player: answers autosave to IndexedDB with a visible "saved on this device" indicator
- Submit offline → "Saved offline — waiting to sync"
- Submissions list with full lifecycle: Pending Sync → Syncing → Synced / Sync failed (+ Retry)
- Profile: local storage stats, **Simulate Offline** switch, Sync Now, clear local data

### Platform
- Global Online/Offline indicator and offline banner
- Mobile-style bottom navigation (student & teacher variants)
- Full-width responsive layout on desktop, tablet, and mobile
- PWA: manifest, icons, service worker with network-first app shell
- Loading, empty, error, and success states on every major screen
- Demo login (Teacher Demo / Student Demo) — no OAuth, no external auth provider

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  React UI (pages · components · layouts)                   │
│      ↓                                                      │
│  Contexts: Auth · Connection · Toast · Sync                 │
│      ↓                                                      │
│  Services: join · submissions · sync engine                 │
│      ↓                                    ↓                 │
│  Dexie/IndexedDB                     API client (fetch)     │
│  cachedActivities                        ↓                  │
│  draftAnswers                      Express API              │
│  localSubmissions                       ↓                  │
│  syncQueue                         Services/validators      │
│  syncMetadata                             ↓                  │
│                                    SQLite (better-sqlite3)  │
└────────────────────────────────────────────────────────────┘
```

**Separation of concerns**

| Layer | Location | Responsibility |
|---|---|---|
| UI | `client/src/pages`, `components` | Rendering, forms, states |
| Frontend state | `client/src/context` | Auth session, online/offline, sync phase, toasts |
| Local storage | `client/src/db` | Dexie schema + repositories (IndexedDB) |
| API client | `client/src/lib/api.ts` | Fetch wrapper, auth header, offline simulation |
| Domain services | `client/src/services` | Join/cache, local submit, sync queue runner |
| Backend API | `server/src/routes`, `controllers` | HTTP surface, validation, status codes |
| Backend services | `server/src/services` | Business rules, scoring, codes, auth tokens |
| Database | `server/src/db` | SQLite schema, seed, queries |
| Shared types | `shared/src/types` | Single source of truth for DTOs |

---

## Tech Stack

| Concern | Choice | Cost |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Free |
| Styling | Tailwind CSS v4 | Free |
| Icons | lucide-react | Free |
| Routing | react-router-dom | Free |
| Offline DB | Dexie.js (IndexedDB) | Free |
| Backend | Node.js + Express + TypeScript (tsx) | Free |
| Database | SQLite via better-sqlite3 (WAL) | Free |
| Validation | Zod | Free |
| PWA | Hand-rolled service worker + manifest | Free |
| Tests | Vitest + Playwright | Free |

No Firebase, Supabase, AWS, Auth0, or any service requiring a credit card.

---

## Folder Structure

```
classsync/
├── client/                  # Frontend (Vite root)
│   ├── public/              # manifest, service worker, icons
│   └── src/
│       ├── components/      # UI kit, shell, nav, indicators
│       ├── context/         # Auth, Connection, Sync, Toast
│       ├── db/              # Dexie schema + repositories
│       ├── lib/             # api client, session, formatting
│       ├── pages/           # teacher/ …, student/ …, login, 404
│       ├── services/        # join, submissions, sync engine
│       ├── App.tsx
│       ├── main.tsx
│       └── styles.css
├── server/
│   └── src/
│       ├── controllers/     # request handlers
│       ├── db/              # SQLite schema, seed, queries
│       ├── middleware/      # session auth
│       ├── routes/          # /api router
│       ├── services/        # activities, auth, submissions, …
│       ├── app.ts
│       └── index.ts
├── shared/src/types/        # shared DTOs
├── tests/
│   ├── client/              # IndexedDB + sync engine unit tests
│   ├── server/              # API + scoring + idempotency tests
│   ├── e2e/                 # full browser offline demo (Playwright)
│   └── setup.ts
├── data/classsync.db        # SQLite (gitignored, auto-created)
├── .env.example
├── vite.config.ts           # client + vitest config
└── package.json
```

---

## Database

### Server — SQLite (`data/classsync.db`)

```sql
users (
  id TEXT PK, name TEXT, role TEXT CHECK (role IN ('teacher','student'))
)

activities (
  id TEXT PK, title, description, type,
  teacher_id TEXT FK → users,
  status TEXT CHECK (status IN ('draft','published')),
  code TEXT UNIQUE,            -- e.g. CS-7K4P
  deadline TEXT NULL,
  created_at, updated_at
)

questions (
  id TEXT PK, activity_id TEXT FK CASCADE,
  type TEXT CHECK (IN ('multiple_choice','short_answer')),
  prompt, points INT, correct_answer TEXT NULL, position INT
)

question_options (
  id TEXT PK, question_id FK CASCADE,
  label, is_correct INT (0|1), position
)

submissions (
  id TEXT PK,
  client_submission_id TEXT UNIQUE,  -- idempotency key from the client
  activity_id FK, student_id FK,
  score INT, max_score INT,
  status TEXT CHECK (IN ('received','synced')),
  submitted_at
)

submission_answers (
  id TEXT PK, submission_id FK CASCADE,
  question_id FK CASCADE, answer TEXT
)

activity_progress (
  activity_id + student_id PK,
  started_at, updated_at          -- powers Not Started / In Progress
)
```

### Client — IndexedDB (`classsync-client`, via Dexie)

| Store | Key | Purpose |
|---|---|---|
| `cachedActivities` | `id` (+ `code`, `updatedAt`, `cachedAt`) | Activities downloaded for offline use |
| `draftAnswers` | `id` = `activityId::questionId` | Live answers, written on every keystroke/selection |
| `localSubmissions` | `id`, unique `clientSubmissionId` | Frozen answer snapshot + lifecycle status |
| `syncQueue` | `id`, unique `clientSubmissionId` | Pending uploads (`PENDING` / `SYNCING` / `SYNC_FAILED`) |
| `syncMetadata` | `key` | e.g. last sync timestamp |
| `pendingJoins` | `code` | Offline join codes waiting to download |

---

## Offline Strategy

1. **Cache on join** — `GET /api/join/:code` returns the full activity; the client writes it to `cachedActivities` before showing success. Offline, a cached code joins instantly; an unknown code is written to `pendingJoins` and downloaded automatically on reconnect (`processPendingJoins`, also run on every sync).
2. **Read local first** — opening an activity reads IndexedDB only. No network request is required (or attempted for rendering).
3. **Optimistic answer writes** — every change hits `saveDraftAnswer()` immediately (IndexedDB transaction). The UI shows *"Answers saved on this device · time"*.
4. **Durable across refreshes** — drafts and queue live in IndexedDB, not React state. Refresh, close the browser, reopen: answers are there.
5. **Service worker** — network-first for navigations and same-origin assets with cache fallback, so the app shell itself loads offline after one online visit.
6. **Simulate Offline** — a Profile toggle makes the API client refuse network calls *without* disabling real persistence, so the demo is honest: the same IndexedDB paths run.

> Note: student-facing activity payloads are sanitized server-side (`correctAnswer` stripped) so the answer key isn't sitting in the offline cache.

## Sync Strategy

```
DRAFT ──submit──▶ PENDING_SYNC ──▶ SYNCING ──server 2xx──▶ SYNCED
                      │                │
                      │                └──network/5xx──▶ SYNC_FAILED ──retry──▶ PENDING/SYNCING
                      └── (manual / auto retry always allowed)
```

- **Submit offline**: `enqueueSubmission()` atomically writes `localSubmissions` (status `PENDING_SYNC`) + `syncQueue` (status `PENDING`) in one Dexie transaction. Nothing is removed.
- **Triggers**: browser `online` event, leaving Simulate Offline, app start, manual **Sync Now**, per-item **Retry**.
- **Transport**: `POST /api/sync` with `{ submissions: [{ clientSubmissionId, activityId, answers }] }`.
- **Success**: server response updates the local submission to `SYNCED` (with score + server id), deletes the queue item, then clears drafts for that activity.
- **Failure**: queue item and local submission stay put with `SYNC_FAILED` + `lastError`. Local answers are **never** deleted until the server confirms.
- **Duplicates**: `clientSubmissionId` is unique client-side (reused per activity) and unique server-side (SQL unique index). A retried sync returns the existing row with `duplicate: true` instead of inserting twice.
- **Scoring**: always computed server-side (`calculateScore`, case/space-normalized).

---

## Local Setup

Requirements: **Node.js ≥ 20** and npm. Nothing else. No accounts, no API keys, no credit card.

```bash
git clone <your-fork-url> classsync   # or copy the folder
cd classsync
npm install
cp .env.example .env                  # optional — safe local defaults already built in
```

`.env` (all optional locally):

```bash
PORT=4000
DATABASE_PATH=./data/classsync.db
CLIENT_ORIGIN=http://localhost:5173
AUTH_SECRET=replace-with-a-long-local-secret
AUTH_SESSION_MAX_AGE_MS=604800000
```

If `AUTH_SECRET` is unset the server uses a built-in local development secret and prints a warning — fine for the demo.

## Running the App

```bash
# API (port 4000) + Vite dev server (port 5173) together
npm run dev
```

Then open **http://localhost:5173**.

Other useful commands:

```bash
npm run dev:server     # API only
npm run dev:client     # Vite only
npm run start          # API without watch
npm run build          # typecheck + production client build → dist/client
npm run typecheck      # tsc --noEmit
```

The SQLite database and seed data are created automatically on first server start.

## Running Tests

```bash
npm test               # Vitest: server API + client offline/sync unit tests
npm run test:watch     # watch mode
npm run test:e2e       # Playwright full offline demo (needs `npm run dev` running)
```

**Coverage of the critical paths**

| Requirement | Test |
|---|---|
| Activity creation | `tests/server/server.test.ts` |
| Activity code lookup (incl. case-insensitive) | `tests/server/server.test.ts` |
| Score calculation (normalization, partial) | `tests/server/server.test.ts` |
| Submission creation + answers | `tests/server/server.test.ts` |
| Duplicate prevention (`clientSubmissionId`) | server + client tests |
| Sync endpoint idempotency | `tests/server/server.test.ts` |
| Local answer persistence / refresh survival | `tests/client/offline.test.ts` |
| Sync queue enqueue + lifecycle | `tests/client/offline.test.ts` |
| Successful sync → SYNCED, queue cleared | `tests/client/offline.test.ts` |
| Failed sync → data retained | `tests/client/offline.test.ts` |
| Retry after failure, no duplicates | `tests/client/offline.test.ts` |
| Offline join falls back to cache | `tests/client/offline.test.ts` |
| Offline join queues when uncached · drains on reconnect | `tests/client/offline.test.ts` |
| **Full browser demo (offline → sync → teacher)** | `tests/e2e/offline-demo.mjs` |

First-time E2E setup: `npx playwright install chromium`.

---

## Demo Credentials

No passwords — pick a demo account on the login screen:

| Role | Name | Use |
|---|---|---|
| Teacher | **Teacher Demo** | Create/publish activities, view submissions |
| Student | **Alex Santos** | Primary student for the walkthrough |
| Student | Jamie Cruz | Extra roster member |
| Student | Sam Reyes | Extra roster member |

Seeded activities (published): `CS-INTRO` Introduction to Programming · `CS-BASICS` Basic Computer Science · `CS-DIGITAL` Digital Literacy.

---

## Demo Walkthrough

> **Fresh database:** the first activity you publish gets the code **`CS-7K4P`**. To reset at any time, stop the server and delete `data/classsync.db*`.

### The main scenario (exactly as specified)

| # | Step | How |
|---|---|---|
| 1 | Teacher logs in | Login → **Teacher Demo → Enter** |
| 2 | Create activity | Bottom nav **Create** → title *Basic C++ Variables Quiz* → add multiple-choice + short-answer questions → **Save & publish now** |
| 3–4 | Published + code | Detail page shows join code **`CS-7K4P`** (copyable) |
| 5 | Student logs in | Sign out → **Student Demo → Enter** |
| 6 | Enter code | Bottom nav **Join** → `CS-7K4P` → **Find activity** |
| 7 | Cached | Success screen: *"downloaded and cached"* → **Open activity** |
| 8 | Activity opens | Questions render from IndexedDB |
| 9 | **Internet OFF** | Toggle OS/DevTools offline **or** Profile → **Simulate offline** ON. Banner: *"You're offline. Your work is saved on this device."* |
| 10–11 | Answer questions | Pick choices / type answers — indicator shows *"Answers saved on this device · time"* |
| 12–13 | Refresh offline | Hit reload — answers are still selected/typed (IndexedDB, not React state) |
| 14 | Submit offline | **Submit offline** → confirm → *"Saved offline — waiting to sync"*; Submissions shows **Pending sync** |
| 15 | Internet ON | Turn off offline mode / Simulate offline |
| 16–17 | Auto-sync | Toasts: *"Connection restored"* → syncing (Sync pill in header) |
| 18 | Synced | *"Everything is synced."* Local record: **Synced** + score |
| 19–20 | Teacher sees it | Sign out → Teacher Demo → **Submissions** → row for Alex Santos with score; open for answer-by-answer review |

### Demonstrating failure + retry

While offline, submit. Then start the API with the server stopped (or block port 4000) and toggle online: sync fails with **Sync failed — work still saved** + **Retry**. Restart the server, click Retry (or toggle Simulate offline), and the queue drains. Nothing is ever lost.

### Automating the walkthrough

```bash
npm run dev          # terminal 1
npm run test:e2e     # terminal 2 — runs the entire table above in headless Chromium
```

---

## API Overview

```
POST   /api/auth/login              { name, role } → session token
GET    /api/health
GET    /api/dashboard               teacher stats + recent items
GET    /api/activities              teacher: own; student: []
POST   /api/activities              create (teacher)
GET    /api/activities/:id
PUT    /api/activities/:id          update (teacher, owner)
DELETE /api/activities/:id          delete (teacher, owner)
POST   /api/activities/:id/publish   → generates code
GET    /api/activities/:id/progress  roster (teacher)
POST   /api/activities/:id/start     mark started (student)
GET    /api/join/:code              lookup published activity by code
POST   /api/submissions             direct submit (student)
GET    /api/submissions             teacher: all; student: own
GET    /api/submissions/:id
POST   /api/sync                    batch sync, idempotent (student)
```

Errors return `{ "message": "friendly text" }` with proper status codes (400/401/403/404/409). Stack traces are never exposed.

---

## Security Basics (prototype level)

- Zod validation on every write endpoint; IDs and codes pattern-checked
- HMAC-signed session tokens with expiry (no passwords for demo accounts — by design)
- Role guards (`teacher` / `student`) on every mutating route
- Scores **only** computed server-side; client score fields are ignored
- Student API payloads strip `correctAnswer` / `isCorrect`
- User text rendered as React text nodes (auto-escaped), questions capped in length
- SQLite foreign keys + parameterized statements

Not for production auth — that's intentional for a $0 prototype.

---

## Known Limitations

- Demo auth is name + role (no passwords, no OAuth) — fine for local demo only.
- One answer key version per activity; editing a published activity rewrites questions (existing submissions keep their stored question ids where possible — prefer editing drafts).
- Offline **join by code** always succeeds from the device's point of view: cached codes join instantly, new codes are queued in `pendingJoins` and download on reconnect (a wrong/expired code is dropped with an error toast once the server answers).
- Teacher cannot see a student's work until it syncs (inherent to offline-first — pending state is client-side only).
- Short-answer grading is normalized string equality, not semantic/NLP grading.
- No multi-device draft merge — last write wins per question.
- Service worker uses a fixed cache version (`classsync-v2`); bump it when shipping shell changes that must evict old caches.
- Playwright E2E must run against the Vite dev server with the API up.

---

## Acceptance Checklist

Verified against the build:

- [x] `npm install` succeeds · project runs with `npm run dev`
- [x] Frontend builds (`npm run build`) · typecheck clean · backend runs
- [x] SQLite works (auto-migrate + seed)
- [x] Teacher & student login (demo buttons + manual)
- [x] Create / publish activity · code generated (`CS-7K4P` first on fresh DB)
- [x] Student joins with code · activity cached in IndexedDB
- [x] Join works offline — cached codes instant, new codes queued → auto-download on reconnect
- [x] Activity opens offline · answers persist · survive refresh (E2E-proven)
- [x] Offline submit → sync queue → Pending Sync
- [x] Online detection + automatic sync + Sync Now + Retry
- [x] Duplicate submission prevented (`clientSubmissionId`)
- [x] Teacher sees synced submission + correct server-side score
- [x] Bottom navigation on all tabs · full-width layout on desktop and mobile
- [x] PWA manifest + service worker app shell
- [x] Loading / empty / error / success states throughout
- [x] README complete · tests pass (`npm test` + `npm run test:e2e`)
- [x] No TypeScript errors · no critical console errors · no fake core functionality
