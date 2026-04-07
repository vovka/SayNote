# Deployment Guide: SayNote Voice Notes PWA

This guide covers the production deployment sequence for the real architecture:
- Next.js web app + API routes
- Supabase Auth + Postgres persistence
- Cloudflare R2 temporary audio storage
- Separate async worker service

## 1) Provision Supabase + OAuth

1. Create a Supabase project.
2. Enable Google provider in **Auth > Providers**.
3. Configure redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<your-domain>/auth/callback`
4. Record values needed later:
   - Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
   - anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - service role key (`SUPABASE_SERVICE_ROLE_KEY`)

## 2) Provision Cloudflare R2

1. Create a bucket for temporary uploaded audio.
2. Add lifecycle expiration for stale objects (for example, 7 days).
3. Create scoped credentials with read/write/delete access to that bucket.
4. Record:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_ENDPOINT` (if your setup requires an explicit endpoint)

## 3) Configure Environment Variables

Configure all web + worker environments with the same contract:

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
- `R2_ENDPOINT` (optional per provider/account)

## 4) Run Database Migrations

1. Apply schema from `db/schema.sql` to Supabase Postgres.
2. Verify required tables, indexes, constraints, and RLS policies exist.
3. Validate access boundaries with at least two test users.

## 5) Deploy Web (Next.js Frontend + API)

1. Deploy `frontend` to Vercel (or equivalent Next.js host).
2. Build command:

```bash
npm run -w frontend build
```

3. Confirm routes:
   - `/`
   - `/notes`
   - `/settings`
   - `/api/audio/upload`
   - `/api/jobs/:id`
   - `/api/notes`
   - `/api/settings/ai-config`
   - `/api/settings/ai-credentials`

## 6) Deploy Worker (Separate Process)

Deploy `backend/worker` as an always-on process or scheduled runner independent of web requests.

Recommended runtime flow:
1. Claim pending jobs atomically.
2. Resolve user config and encrypted credentials.
3. Decrypt in-memory immediately before provider call.
4. Download audio from R2.
5. Transcribe + categorize.
6. Persist categories/notes/job transitions in Supabase.
7. Delete temporary R2 object.

## 7) End-to-End Validation

Run a full user path:
1. Sign in through Supabase OAuth.
2. Record and upload a note.
3. Verify job lifecycle (`uploaded`/retry states -> `processing` -> `completed`).
4. Verify note appears in `/notes` with expected category path.
5. Verify temporary R2 object deletion after successful processing.

---

## Validation Checklists

### A) Crash recovery + idempotency

- [ ] Re-submit the same upload with identical idempotency key and confirm no duplicate job row.
- [ ] Kill worker during processing and confirm job is retried/reclaimed safely.
- [ ] Confirm terminal failures stop retrying after configured cap.
- [ ] Confirm transient provider/network errors are marked retryable and later recover.

### B) Timestamp preservation

- [ ] Capture client recording timestamp before upload.
- [ ] Confirm server/job metadata persists the original client event time.
- [ ] Confirm rendered note ordering uses preserved timestamps correctly.
- [ ] Confirm retry/reprocessing does not overwrite original capture timestamp semantics.

### C) PWA installability

- [ ] Web app served via HTTPS in production.
- [ ] Manifest is present and valid.
- [ ] Service worker is registered and active.
- [ ] Install prompt or browser install flow is available on supported devices.
- [ ] Installed app launches and can create an offline recording that syncs later.
