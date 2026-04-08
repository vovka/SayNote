# SayNote Voice Notes PWA (MVP)

SayNote is a mobile-first Progressive Web App for recording voice notes, syncing uploads, and asynchronously processing them into categorized notes.

## Architecture (Current)

1. **Next.js frontend + API routes (`frontend/`)**
   - App routes provide recording UI, offline queue UX, notes, and settings.
   - Next.js Route Handlers provide upload/jobs/notes/settings APIs.
2. **Supabase persistence + auth**
   - Supabase Auth (Google OAuth) is the identity provider.
   - Supabase Postgres is the system of record for jobs, notes, categories, and user settings/credentials metadata.
3. **Cloudflare R2 for temporary audio objects**
   - Uploaded audio is stored in R2 during async processing and deleted after successful completion.
4. **Separate worker process (`backend/worker`)**
   - A standalone worker claims pending jobs, downloads audio from R2, runs provider adapters, writes results to Supabase, and updates job status.

---

## Implemented Now

- Mobile-first one-tap recording UI (`/`).
- Offline-first local queue with IndexedDB + Dexie.
- Foreground sync triggers (startup/focus/online/interval).
- Upload/jobs/notes/settings API routes.
- Idempotency key support on upload/job creation.
- Provider adapter abstraction with Groq/OpenRouter implementations.
- Encryption utility for user BYOK credential storage.
- Supabase SQL schema and RLS-oriented multi-tenant model.
- Worker pipeline for async transcription + categorization + persistence.
- Cloudflare R2 temporary object lifecycle integration.

---

## Required External Environment Setup

SayNote local and production environments require externally provisioned managed services.

### 1) Required services

- Supabase project (Auth + Postgres)
- Google OAuth credentials wired through Supabase Auth
- Cloudflare R2 bucket + API credentials
- AI provider account(s), e.g. Groq and/or OpenRouter

### 2) Environment contract

Copy and populate local env values:

```bash
cp .env.example .env
```

Required variables:

- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `ENCRYPTION_MASTER_KEY` (32+ chars)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT` (if required by your R2 setup)

Initialize the database before starting the app:

```bash
npm run db:bootstrap
```

For later schema changes on an existing database:

```bash
npm run db:migrate
npm run db:migrate:status
```

---

## Local Run Commands (Exact)

### Option A (recommended): containerized frontend + worker

```bash
docker compose up --build
```

- Frontend/API: `http://localhost:3000`
- Worker: async processing loop in separate container

### Option B: run processes directly

In terminal 1 (frontend):

```bash
npm install
npm run -w frontend dev
```

In terminal 2 (worker):

```bash
npx tsc -p backend/tsconfig.json
npm run -w backend worker
```

Optional verification:

```bash
npm run typecheck
npm test
```

---

## Known Remaining Gaps (Only)

- Durable queue/broker integration is still optional; current deployment can use polling worker.
- End-to-end automated integration tests (web + worker + Supabase + R2) are not yet included.
- Expanded production observability/alerts and runbooks can be further hardened.

For deployment, see `docs/deployment-guide.md`.
