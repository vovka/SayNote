# SayNote Voice Notes PWA (MVP)

This repository implements the Voice Notes PWA architecture from `docs/voice-notes-pwa-spec.md` with:

- Mobile-first one-tap recording UI (`/`)
- Offline-first queue using IndexedDB + Dexie
- Automatic foreground sync with retry/backoff and idempotency key support
- API endpoints for upload/jobs/notes/settings
- Worker-compatible provider adapter layer (Groq + OpenRouter)
- BYOK encryption utility (AES-256-GCM)
- SQL schema for Supabase auth-backed multi-tenant data model + RLS

> **Note:** API persistence is currently wired to an in-memory store for local development simplicity. For production, connect routes to Supabase + R2 + worker queue.

## Implemented Scope

### Frontend
- Record screen with single large record button and status text
- Notes page rendering nested category tree
- Settings page for provider/model + API key submit
- Local recording state machine in IndexedDB
- Sync triggers: startup, focus, online event, periodic timer
- Retry strategy: exponential backoff with jitter and terminal failure cap

### Backend API (Next.js Route Handlers)
- `POST /api/audio/upload` with idempotency key and queued async completion stub
- `GET /api/jobs/:id`
- `GET /api/notes`
- `PUT/GET /api/settings/ai-config`
- `PUT /api/settings/ai-credentials` (encrypt-before-store flow)

### Worker Modules
- Unified `AIProviderAdapter` contract
- `GroqAdapter` and `OpenRouterAdapter`
- Provider registry lookup
- Job processing pipeline (transcribe -> categorize -> normalized path)
- Encryption abstraction
- Temporary storage abstraction for R2

### Data Model
- Full SQL schema for categories, notes, jobs, user AI credentials/config, and RLS intent.

---

## Detailed Deployment Guide (All Parts)

## 1) Prerequisites

1. **Accounts/Infrastructure**
   - Vercel project for frontend+API hosting
   - Supabase project (Auth + Postgres)
   - Cloudflare account with R2 bucket
   - AI provider account(s): Groq and/or OpenRouter
2. **Local tooling**
   - Node.js 20+
   - npm 10+
   - Supabase CLI (optional, recommended)
3. **Environment secrets**
   - Supabase URL + anon key + service role key
   - Google OAuth client ID/secret (for Supabase Auth)
   - Cloudflare R2 endpoint/access key/secret/bucket
   - `ENCRYPTION_MASTER_KEY` (32+ chars random secret)
   - Optional queue broker secret if you add one (Upstash, SQS, etc.)

## 2) Supabase Setup

1. Create a new Supabase project.
2. In **Authentication > Providers**, enable **Google**.
3. Configure Google OAuth redirect URIs:
   - Local: `http://localhost:3000/auth/callback`
   - Prod: `https://<your-domain>/auth/callback`
4. Run SQL schema:
   - Open Supabase SQL Editor.
   - Paste `db/schema.sql` and execute.
5. Verify tables and policies are created.
6. (Recommended) Create DB functions/RPCs for:
   - atomic job claim (`processing_jobs` status transitions)
   - category path upsert transaction

## 3) Cloudflare R2 Setup

1. Create bucket (example: `saynote-temp-audio`).
2. Enable lifecycle expiration rule for stale audio (e.g., 7 days).
3. Create API token with least privilege:
   - write/read/delete on the bucket
4. Record endpoint and credentials in environment variables.

## 4) Frontend + API Deployment (Vercel)

1. Import this repository into Vercel.
2. Configure root project to run the `frontend` app (or monorepo auto-detection).
3. Add environment variables:
   - `NEXT_PUBLIC_BASE_URL=https://<your-domain>`
   - `NEXT_PUBLIC_SUPABASE_URL=<supabase-url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
   - `R2_ACCOUNT_ID=<...>`
   - `R2_ACCESS_KEY_ID=<...>`
   - `R2_SECRET_ACCESS_KEY=<...>`
   - `R2_BUCKET=<...>`
   - `ENCRYPTION_MASTER_KEY=<long-random-secret>`
4. Deploy.
5. Confirm:
   - `/` loads and records on a secure origin (https)
   - `/notes` and `/settings` reachable
   - `/api/*` endpoints return expected JSON

## 5) Worker Deployment

The worker should run separately from web request lifecycle.

### Option A: Containerized worker (recommended)
1. Build a worker image containing `backend/worker` code.
2. Run as scheduled poller (every few seconds) or queue consumer.
3. Worker loop should:
   - claim pending jobs transactionally
   - fetch encrypted provider key + decrypt in memory
   - download audio from R2
   - call provider adapter
   - upsert category path + insert note
   - delete audio from R2
   - mark job completed/failure
4. Configure autoscaling by queue depth.

### Option B: Cron-triggered serverless function
1. Deploy worker function as a cron job.
2. On each run, process small batch of jobs (e.g., 5-20).
3. Keep execution time below platform limits.

## 6) Replace In-Memory Store with Production Integrations

Before production, replace `frontend/lib/api/in-memory-store.ts` with:

1. **Upload endpoint**
   - Persist job in `processing_jobs` using idempotency key unique constraint.
   - Upload audio to R2 under user-scoped path.
2. **Job endpoint**
   - Read from `processing_jobs` table.
3. **Notes endpoint**
   - Query `notes + categories` and shape into tree.
4. **Settings endpoints**
   - `user_ai_config`: upsert selected provider/models.
   - `user_ai_credentials`: store encrypted key + fingerprint only.

## 7) Security Hardening Checklist

- [ ] Enforce HTTPS only.
- [ ] Never log plaintext secrets or auth headers.
- [ ] Rotate `ENCRYPTION_MASTER_KEY` via versioned key strategy.
- [ ] Constrain service-role key to backend environment only.
- [ ] Add request size limits on upload route.
- [ ] Add MIME allowlist and duration/file-size constraints.
- [ ] Add rate limits (upload/settings endpoints).
- [ ] Validate RLS with explicit test users.

## 8) Observability and Alerting

Track these metrics:
- upload success/failure rate
- job completion latency
- retry counts and terminal failures
- provider error rates by model/provider
- orphan R2 object count

Alert thresholds:
- failed jobs > X% for 5 min
- queue backlog age > N minutes
- R2 delete failures above baseline

## 9) Local Development

```bash
npm install
npm run -w frontend dev
```

Open `http://localhost:3000`.

To typecheck:

```bash
npm run typecheck
```

## 10) Production Readiness Gaps (Intentional)

This MVP implementation leaves the following as integration tasks:

- real Supabase auth session wiring for user identity
- real R2 client for upload/download/delete
- durable queue or atomic polling lock for worker
- provider SDK HTTP implementations in adapters
- end-to-end integration tests

