# Deployment Guide: SayNote Voice Notes PWA

This document describes deployment for every component: frontend PWA, API routes, Supabase database/auth, Cloudflare R2, and async worker.

## Architecture Components

1. **Frontend PWA (Next.js)**
   - Runs on Vercel
   - Handles recording, offline queue, and sync triggers
2. **API Routes (Next.js server runtime)**
   - Upload endpoint
   - Jobs/Notes/Settings endpoints
3. **Supabase**
   - Google OAuth via Supabase Auth
   - Postgres persistent tables + RLS
4. **Cloudflare R2**
   - Temporary audio object store
5. **Async Worker**
   - Pulls pending jobs and performs transcribe/categorize/store/delete lifecycle

## Step 1: Database + Auth (Supabase)

1. Create project.
2. Enable Google provider in Auth.
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<prod-domain>/auth/callback`
4. Execute SQL in `db/schema.sql`.
5. Validate policies by testing with two separate users.

## Step 2: Object Storage (Cloudflare R2)

1. Create bucket for temporary audio.
2. Configure lifecycle expiration for stale files (e.g., 7 days).
3. Create API token restricted to that bucket.

## Step 3: Secrets and Environment Variables

Configure these in Vercel and worker runtime:

- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `ENCRYPTION_MASTER_KEY`

`ENCRYPTION_MASTER_KEY` requirements:
- Required in every non-development runtime (API + worker). Startup fails fast when missing.
- Must never be set to insecure placeholders such as `dev-only-master-key-change-me`.
- Rotate at regular intervals and after any suspected secret exposure.

## Step 4: Deploy Frontend + API on Vercel

1. Import repository into Vercel.
2. Build command: `npm run -w frontend build`
3. Output: Next.js default.
4. Deploy.
5. Smoke test:
   - `/` record UI renders
   - `/settings` saves config
   - `/api/settings/ai-config` returns saved config

## Step 5: Deploy Worker

Recommended: separate containerized service.

Worker loop responsibilities:
1. Claim pending jobs atomically.
2. Read user config + encrypted credentials.
3. Decrypt key in-memory only.
4. Fetch audio from R2.
5. Transcribe and categorize using adapter registry.
6. Upsert categories and insert note.
7. Delete R2 object.
8. Mark job as `completed`.
9. On failure: increment retry with retryable/terminal split.

## Step 6: Integrate Real Services (Production Cutover)

Replace in-memory implementations with:
- Supabase table reads/writes
- Actual R2 upload/download/delete
- Queue or cron-based worker scheduler
- Real provider HTTP/API calls in adapters

## Step 7: Operational Controls

- Monitoring dashboard for upload success, processing latency, retries, and failures
- Alerts for failure spikes and queue backlog growth
- Log redaction rules preventing secret leakage
- Regular encryption key rotation policy

## Step 8: Validation Checklist

- Offline recording works and survives browser restart
- Online reconnect automatically uploads pending recordings
- Idempotency prevents duplicate job creation
- Completed jobs create notes with nested category paths
- R2 objects are deleted after successful processing
- Plaintext API keys are never returned by API

## Key Rotation + Credential Re-encryption Runbook

When rotating `ENCRYPTION_MASTER_KEY`, existing encrypted credentials must be re-encrypted.

1. **Prepare a maintenance window**
   - Pause worker processing so no jobs decrypt while rotation is in-flight.
   - Keep API writes for credential updates disabled or queued.
2. **Stage new key**
   - Generate a new high-entropy `ENCRYPTION_MASTER_KEY`.
   - Store it in secret manager as the next key version.
3. **Run re-encryption migration**
   - For each row in `user_ai_credentials`:
     - Decrypt `encrypted_api_key` with the old key.
     - Encrypt plaintext with the new key.
     - Update `encrypted_api_key` in one transaction batch.
   - Do not log plaintext, ciphertext, or raw exception payloads during migration.
4. **Switch runtime secrets**
   - Update API and worker environments to the new `ENCRYPTION_MASTER_KEY`.
   - Restart services and verify startup succeeds (it should fail fast on insecure defaults).
5. **Post-rotation validation**
   - Save a test credential through Settings API and confirm metadata-only response.
   - Run a worker job end-to-end to confirm provider calls decrypt successfully.
6. **Retire old key**
   - Remove old key material from runtime environments and secret manager active set.
